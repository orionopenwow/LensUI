# Lens bridges: browser, right-click, links, scripts and Claude

Lens can take work from wherever you are:

- **The browser.** Right-click a page, selection, link, image or video and pick **Lens ›**. A side panel streams the answer.
- **File Explorer.** Right-click any file or folder and pick **Lens ›**.
- **A link.** A `lens://` link opens Lens with the request.
- **A script.** PowerShell or AutoHotkey can send text to Lens.

Lens also offers **Connect to Claude** for Claude Desktop and Claude Code.

All of them use one message format and one local endpoint. Every request appears in Lens. Nothing goes to a cloud model until you confirm it there. A local model may answer straight away, but only when Lens AI allows it.

```
 Browser extension ──native messaging──▶ lens-ui.exe (native host) ─┐
 lens:// link ─────▶ lens-ui.exe --url … ───────────────────────────┤  token-protected
 Explorer verb ────▶ lens-ui.exe --action <verb> "%1" ──────────────┤  127.0.0.1 endpoint
 Script ───────────▶ lens-ui.exe --ask - / --ask-file ──────────────┘  (bridge::ipc)
                                                                         │
                         running Lens: validate → inbox → lens://bridge/request
                                         │            │             │
                                  AiPort (ai-core)  ShelfPort    transcription (media)
```

## The browser extension

The extension lives in `extensions/browser/`. It is Manifest V3, and one codebase serves Chrome, Edge, Brave and Firefox. It has no network access of its own (CSP `connect-src 'none'`) and no remote code or analytics. A check in `build.mjs` and a bun test enforce this.

**Right-click menu (Lens ›).** The items change with what you clicked:

| Item | Selection | Page | Link | Image | Video/audio |
| --- | :-: | :-: | :-: | :-: | :-: |
| Ask about this (local) — opens the side panel with the context; you type the question | ✓ | ✓ | ✓ | ✓ | |
| Summarise › TL;DR / Key points / Detailed | ✓ | ✓ | ✓ | | |
| Explain simply | ✓ | | ✓ | | |
| Translate › 10 languages | ✓ | ✓ | | | |
| Rewrite › Shorter / Friendlier / More formal | ✓ | | | | |
| Fix grammar | ✓ | | | | |
| Extract › Tables / Links / Dates / To-dos | ✓ | ✓ | | | |
| Add to Shelf | ✓ | ✓ (readable Markdown) | ✓ | ✓ | ✓ |
| Copy as Markdown (with a source link; stays in the browser) | ✓ | ✓ | ✓ | | |
| Copy page into context (adds to the active Command context) | ✓ | ✓ | | | |
| Compare with Shelf item… (Lens asks which item) | ✓ | ✓ | | | |
| Transcribe video (sends the URL only) | | ✓ on video sites | ✓ | | ✓ |
| Open in Lens Command | ✓ | ✓ | ✓ | ✓ | ✓ |

**Keyboard.** Change these at `chrome://extensions/shortcuts` or in Firefox's add-on shortcuts.

| Keys | Does |
| --- | --- |
| Alt+Shift+L | Open Lens Command with the selection |
| Alt+Shift+S | Add the selection, or the page, to the Shelf |

**Side panel.** Chrome and Edge use `sidePanel`; Firefox uses `sidebar_action`. The panel streams each answer as it arrives. Each answer card shows:

- a **Local** or **Claude** badge, so you know which engine answered;
- the context that was sent, as chips ("Selection · 1,204 chars", "Page · 38 KB", the site name);
- **Copy**, **Add to Shelf** and **Open in Lens Command** buttons.

While a request waits for you, the panel shows *Waiting for you to confirm in Lens*.

**Page text.** `src/readable.js` is a lean Readability-style extractor. It finds the main content: it prefers `<article>`, `<main>` or `role=main`; otherwise it scores elements by their paragraph text. It drops navigation, footers, sidebars, scripts, forms and hidden content. It converts the result to Markdown (headings, lists, code blocks, quotes, tables, links and images) and caps it at **200 KB**.

**Build and load.**

```
bun run ext:build      # → extensions/browser/dist/{chrome,edge,firefox}/ and lens-<browser>-<version>.zip
bun run ext:check      # manifest + source checks only
```

- **Chrome, Edge or Brave:** open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**. Choose **Load unpacked** and pick `extensions/browser/dist/chrome` (Edge can use `dist/edge`). The manifest carries a public `key`, so the unpacked extension always has the id **`flioplocnjlfpjbgoekcbdmacpedkaej`**. The bridge manifest already allows that id.
- **Firefox:** open `about:debugging` › This Firefox › **Load Temporary Add-on** and pick `dist/firefox/manifest.json`. The add-on id is `lens-bridge@lensui.app`. To keep it permanently, the add-on must be signed by Mozilla (AMO).
- **Store builds** get a different id. Paste it into *Extra extension ids* in Lens before installing the bridge.

## The native host

`lens-ui.exe` itself is the native-messaging host. Lens detects the launch from the arguments the browser passes:

- **Chromium browsers** pass `chrome-extension://<id>/`.
- **Firefox** passes the manifest path and the extension id.

The host manifests point straight at the exe, so no batch file or console window is involved.

Protection is layered:

1. **The browser** only starts the host for ids listed in `allowed_origins` / `allowed_extensions`.
2. **The host** checks the caller again against the manifest Lens wrote. It also strips any `path` field, so a browser can never hand Lens a local file.
3. **The host** forwards each message over the loopback endpoint. Like the MCP bridge, the endpoint uses a random port and a 256-bit token, stored in `%APPDATA%\LensUI\bridge-endpoint.json` and compared in constant time.
4. **The running Lens** validates the message again: known fields only (`deny_unknown_fields`), known actions and options, `http(s)` URLs only with no credentials, 200 KB page-text cap, 50k-character selection cap, 30 requests a minute, and an inbox of 50. Paths are accepted only from Explorer and CLI launches, and only as absolute paths without `..`.

**Framing.** Each message is a 4-byte native-endian length followed by UTF-8 JSON. Extension → host messages are capped at 512 KB. Host → extension replies stay under Chrome's 1 MB limit; long answers are trimmed with a pointer to Lens.

**Streaming.** When a request sets `"stream": true` (the side panel uses `connectNative`), the host polls Lens for the request's state. It sends `{type:"delta"}`, `{type:"state"}` and finally `{type:"done"}` frames, which carry the engine label.

**Install and remove.** Use Settings › Connections › Browser extension › *Install bridge…* or *Remove*. Install writes two manifest files to `%APPDATA%\LensUI\bridge\`, plus one HKCU key per chosen browser:

- `Software\Google\Chrome\NativeMessagingHosts\com.lensui.bridge`
- `Software\Microsoft\Edge\…`
- `Software\BraveSoftware\Brave-Browser\…`
- `Software\Chromium\…`
- `Software\Mozilla\NativeMessagingHosts\…`

## Messages

Request (camelCase JSON):

```jsonc
{ "v": 1, "action": "summarize", "variant": "key_points",
  "selection": "…", "pageText": "…markdown…", "url": "https://…", "title": "…",
  "linkUrl": "…", "imageUrl": "…", "mediaUrl": "…", "targetLang": "Spanish", "question": "…",
  "shelfRef": "pick", "item": { "kind": "page", "title": "…", "text": "…", "url": "…" },
  "preferLocal": true, "useClipboard": false, "stream": true }
```

**Actions:**

| Group | Actions |
| --- | --- |
| Meta | `ping`, `status` (by `id`) |
| AI | `ask`, `summarize` (`tldr` · `key_points` · `detailed`), `explain`, `translate`, `rewrite` (`shorter` · `friendlier` · `formal`), `fix_grammar`, `extract` (`tables` · `links` · `dates` · `todos`), `compare` |
| Local | `transcribe`, `shelf_add`, `context_add`, `command_open` |

**Reply:** `{ v, ok, id, state, text, engine, error, needsConfirmation }`. `state` is one of `pending`, `running`, `answered`, `declined`, `failed`, `delivered` (UI actions) or `saved` (Shelf).

**Event to the app.** Lens emits `lens://bridge/request` when a request arrives. The payload uses snake_case keys:

```
{ id, action, variant, target_lang, question, selection, url, title, page_text, link_url, image_url, media_url,
  path, shelf_ref, origin, browser, prefer_local, use_clipboard, state, needs_confirmation, engine }
```

The Command surface renders these. `lens://bridge/update {id, state, engine, error}` follows whenever a request's state changes.

## File Explorer right-click

Install from Settings › Connections › *File Explorer right-click › Add…*. It previews the keys first and applies them only after you confirm.

| Where | Menu | Runs |
| --- | --- | --- |
| Every file (`HKCU\Software\Classes\*\shell\LensUI`) | **Lens ›** Ask Lens about this file · Summarise · Add to Shelf · Copy path into context | `"lens-ui.exe" --action ask\|summarize\|shelf_add\|context_add "%1"` |
| Folders (`…\Directory\shell\LensUI`) | **Lens ›** Ask Lens about this folder · Add to Shelf · Copy path into context | same |
| Audio and video (`…\SystemFileAssociations\<.mp3 .wav .m4a .flac .ogg .opus .aac .wma .mp4 .mkv .mov .webm .avi .wmv .m4v>\shell\LensUI.Transcribe`) | **Transcribe with Lens** | `--action transcribe "%1"` |

- **Submenu.** The cascade uses `MUIVerb` plus an empty `SubCommands` value, with the verbs under the `shell` subkey.
- **Windows 11.** Classic verbs appear under **Show more options**. The new top-level menu needs a packaged app with an `IExplorerCommand` handler, which is future work.
- **Forwarding.** The verb process forwards the request to the running Lens and exits. If Lens isn't running, a small message box says so.
- **Ownership.** Every root key carries `LensUIOwned = 1`. Install refuses to take over a key another app created, and uninstall deletes only keys with the marker. The pure planner `bridge::manifest::explorer_plan` is unit-tested: it covers every key and value, quoting, and the rule that Transcribe appears on media types only.

## lens:// links

*lens:// links › Add…* registers `HKCU\Software\Classes\lens`, which runs `"lens-ui.exe" --url "%1"`.

**Supported links:**

```
lens://ask?q=…&text=…&url=…&title=…&local=1
lens://summarize?url=…&title=…&clip=1&variant=key_points
lens://explain|translate (lang=…)|rewrite|extract|shelf|context|command|transcribe (url=…)
```

Unknown parameters are dropped, and a link can never carry a file path. `clip=1` means "the context is on the clipboard". Lens reads the clipboard only when you click **Send**. The bookmarklet in `scripts/ai/bookmarklet.js` uses this.

## Scripts

See `scripts/ai/README.md` for `lens-ask.ps1` (pipe text in), the AutoHotkey v2 "send selection" snippet, and the bookmarklet. They use `lens-ui.exe --ask - | --ask-file | --url`.

## Connect to Claude

**Claude Desktop.** Settings › Connections › *Connect Claude Desktop…* finds the config file. It tries `%APPDATA%\Claude\claude_desktop_config.json`, or the Store install's `…\Packages\Claude_*\LocalCache\Roaming\Claude\…`. It then shows a diff of the one change:

```json
"lens-ui": { "args": ["--mcp-stdio"], "command": "C:\\…\\lens-ui.exe" }
```

The edit is surgical:

- Lens edits only the `mcpServers["lens-ui"]` member. Your other servers, key order and spacing stay byte-for-byte the same.
- Lens re-parses the result and refuses to write if anything else would change.
- **Confirm** works only with the hash of the file you previewed, so a file changed in between isn't clobbered.
- A `claude_desktop_config.json.lens-backup-<ms>` copy is kept.
- *Disconnect…* removes the entry the same way.

**Claude Code.** The card shows a ready-to-copy command:

```
claude mcp add --scope user lens-ui -- "C:\…\lens-ui.exe" --mcp-stdio
```

Claude can only reach Lens while **AI Apps › Allow AI apps to connect** is on. That is the existing MCP server and its own approval rules.

## Wiring (for the integrator)

This package runs on stubs until ai-core (`feature/ai-core`) and the Shelf (`feature/shelf-command`) land:

- `ports::StubAi` refuses politely.
- `ports::InboxShelf` appends to `%APPDATA%\LensUI\bridge\shelf-inbox.jsonl`, so nothing saved before the Shelf ships is lost. Import it once.

**1. AI adapter.** Add this in app setup, after `bridge::autostart(…)`:

```rust
struct LensAi { app: tauri::AppHandle }
impl crate::bridge::ports::AiPort for LensAi {
    fn ask(&self, request_id: &str, prompt: &str, ctx: &crate::bridge::ports::BridgeContext, prefer_local: bool)
        -> Result<String, String>
    {
        let req = crate::ai::AiRequest {
            id: Some(request_id.to_string()),           // so ai events carry the bridge id
            prompt: prompt.to_string(),
            prefer_local,
            context: crate::ai::AiContext {
                selection: ctx.selection.clone(), clipboard: ctx.clipboard.clone(),
                window_title: ctx.window_title.clone(), app_name: ctx.app_name.clone(),
                files: ctx.files.clone(), url: ctx.url.clone(), page_text: ctx.page_text.clone(),
            },
            ..Default::default()
        };
        let engine = crate::ai::ai_ask(&self.app, req)?;           // returns which provider runs it
        Ok(if engine.is_local() { "local".into() } else { "claude".into() })
    }
    fn requires_confirmation(&self, ctx: &crate::bridge::ports::BridgeContext, prefer_local: bool) -> bool {
        crate::ai::needs_confirmation(ctx_to_ai(ctx), prefer_local)  // ai-core's privacy rule
    }
    fn cancel(&self, request_id: &str) { let _ = crate::ai::ai_cancel(request_id); }
}
crate::bridge::ports::set_ai(std::sync::Arc::new(LensAi { app: app.handle().clone() }));
```

Then route ai-core's events for bridge requests (ids start with `br-`). In Rust:

```rust
app.listen("lens://ai/delta", |e| { /* {id, delta} */ crate::bridge::ipc::append_delta(&id, &delta) });
app.listen("lens://ai/done",  |e| { /* {id, ok, text?, error?} */ crate::bridge::ipc::finish(&id, ok, text, error) });
```

Or from the frontend, with the `bridge_record_delta` / `bridge_record_done` commands.

**2. Shelf adapter.**

```rust
struct LensShelf;
impl crate::bridge::ports::ShelfPort for LensShelf {
    fn shelf_add(&self, item: &crate::bridge::protocol::ShelfItem, shelf: Option<&str>) -> Result<String, String> {
        crate::shelf::shelf_add(item.into(), shelf.map(str::to_string))
    }
}
crate::bridge::ports::set_shelf(std::sync::Arc::new(LensShelf));
```

**3. Command surface.** Listen for `lens://bridge/request`:

- `command_open`: open Command with the selection, URL or title.
- `context_add`: append to the active context.
- `compare` with `shelf_ref: "pick"`: show the Shelf picker, then call `bridge_confirm` with the chosen item in context.

Until then, `src/bridge/BridgeInbox.tsx` lists pending requests with their context chips and Send / Decline buttons.

**4. Control Center.** Add the cards to the AI / Connections tab of `ControlCenterSurface.tsx`:

```tsx
import { ConnectionsCard } from "../bridge/ConnectionsCard";
import { BridgeInbox } from "../bridge/BridgeInbox";
import { TranscriptionCard } from "../media/TranscriptionCard";
// …next to <McpCard … />
<BridgeInbox />
<ConnectionsCard />
<TranscriptionCard />
```

`ConnectionsCard` uses `cc-input` and `cc-chip`, which already exist in `ControlCenterSurface.css`.

**Shared files this branch touched** (kept minimal):

| File | Change |
| --- | --- |
| `src-tauri/src/lib.rs` | Added `mod bridge; mod media;`, an early-exit call `bridge::early_exit_code()` right after the MCP stdio check, `bridge::autostart(...)` at the top of `.setup`, and 25 command registrations |
| `src-tauri/src/commands/mod.rs` | `pub(crate) mod bridge; pub(crate) mod media;` |
| `package.json` | `ext:build` and `ext:check` scripts |
| `src/types/generated.ts` | Regenerated |

`config.rs` and `Cargo.toml` are unchanged. Bridge and transcription settings live in their own files under `%APPDATA%\LensUI\`, and there are no new crates (SHA-256 and the zip writer are small in-tree implementations).
