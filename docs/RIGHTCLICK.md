# Right-click everywhere, micro-saves and context packs

One right-click menu for all of Lens. It covers the browser extension, Lens Browser, File Explorer, the Shelf, the Dock, Lens Mini, the clipboard and notifications. It also adds instant micro-saves to the Shelf and context packs for Claude.

## The action catalogue

One JSON file is the only list of actions: `src/context/actions.catalog.json`.

| Reader | How |
|---|---|
| Frontend (Control Center, Dock, Mini, Shelf, Lens Browser) | `src/context/actions.ts`: `menuFor(ctx, prefs, usage)`, `appliesTo`, `orderedActions`, editing helpers |
| Rust (Explorer verbs, preferences, tests) | `src-tauri/src/bridge/actions.rs` (`include_str!` of the same file) |
| Browser extension | `extensions/browser/src/catalog.gen.js`, written by `bun run ext:build`; a bun test fails if it drifts |

Each action has:
- `id` and `label`
- `icon`, a lucide name rendered by `src/context/ActionIcon.tsx`
- `group`
- `contexts`
- `provider`: `local`, `default`, `claude` or `none`
- `risk`: `low` or `confirm`
- `variants?`
- `surfaces`

### Contexts and surfaces

The contexts are `selection`, `page`, `link`, `image`, `video`, `youtube`, `file`, `folder`, `window`, `app`, `clipboard`, `shelf`, `notification` and `desktop`.

A file context can name a type, for example `file:media`, `file:text` or `file:document`. File types are matched by extension using `fileTypes` in the JSON.

The surfaces are `browser`, `lensBrowser`, `explorer`, `shelf`, `dock`, `mini`, `clipboard` and `notification`.

### Rules

- Anything with provider `claude` must have risk `confirm`. Tests enforce this in both TypeScript and Rust.
- Menus show at most 7 items, then **More**.
- Order is: pinned actions, then the user's own order, then catalogue order.
- With **Learn from use** on (off by default), actions float up within the unpinned part by local usage counts. Turning it off forgets the counts.
- Hidden actions never show, including in Explorer the next time its verbs are installed.

### Custom actions

Custom actions are prompt templates. They can use these placeholders: `{selection} {clipboard} {shelf} {page} {lang} {title} {url}`.

Their ids look like `custom:<slug>`. A user can keep at most 40.

You can import and export them as `{ kind: "lens-context-menu", version: 1, prefs }`. On import:
- unknown ids are dropped;
- invalid custom actions are skipped and reported.

### Settings card and storage

The settings card is `src/context/ContextMenuCard.tsx`. It lets the user pick where the menu appears, drag to reorder, pin or hide actions, preview the menu, add custom actions, and import, export or reset.

Preferences are stored in `%APPDATA%\LensUI\context-actions.json`, using the commands `context_menu_get|set|record_use|reset`.

### The full catalogue

| id | Label | Where | Engine |
|---|---|---|---|
| ask | Ask about this | selection, page, link, image, YouTube, file, folder, window, app, clipboard, shelf, notification | local |
| summarize | Summarise (TL;DR / key points / detailed) | selection, page, link, YouTube, text & document files, clipboard, shelf, notification | default |
| explain | Explain simply | selection, link, clipboard, shelf, notification | default |
| translate | Translate | selection, page, clipboard, shelf | default |
| rewrite | Rewrite (shorter / friendlier / formal) | selection, clipboard | default |
| fix_grammar | Fix grammar | selection, clipboard | local |
| extract | Extract (tables / links / dates / to-dos) | selection, page, clipboard, shelf | default |
| compare | Compare with Shelf item… | selection, page, shelf | default |
| micro_save | Micro-save | selection, page, link, image, YouTube, file, folder, clipboard, notification | — |
| shelf_add | Add to Shelf | selection, page, link, image, video, YouTube, file, folder, clipboard, notification | — |
| pack_add | Add to pack… | shelf, file, folder, selection, page | — |
| yt_transcript | Get transcript (YouTube captions) | YouTube | — |
| transcribe | Get transcript (whisper) | video, media files, link | local |
| context_add | Load into context | selection, page, file, folder, clipboard, shelf, window | — |
| copy_md | Copy as Markdown | selection, page, link, YouTube, shelf | — |
| ask_files | Ask about these files | several files / folders (Explorer) | local |
| send_claude | Send to Claude | shelf, selection, page | Claude (asks first) |
| command_open | Open in Lens Command | everywhere | — |
| command_here | Lens Command here | desktop background | — |

## Micro-saves

Micro-saves are instant, tiny captures onto the Shelf. Saving shows a one-line toast and never opens a window. The logic is `src-tauri/src/shelf/micro.rs` and it is pure.

**Duplicates.** If the same text from the same page or file is already on the Shelf, Lens says so and changes nothing. "The same text" ignores case, spacing and quote marks.

**Merging.** Consecutive saves from the same page within 10 minutes become one item, with each capture as its own `> quote`. A save from another page in between breaks the run.

**Tags.** Each save is tagged `micro`, plus the site (`github.com`) or app (`code`).

**Notes.** An optional note is added as `_Note: …_`, either when saving or later from the toast's **Add note** button.

**Size.** Every item shows approximate tokens.

### Entry points

| Where | How |
|---|---|
| Browser | Right-click → Lens → **Micro-save**, or **Alt+Shift+S**. A closed-Shadow-DOM toast appears in the page. Browsers don't allow Ctrl+Alt shortcuts for extensions. |
| Desktop apps | `selection_micro_save` reads the selection through UI Automation with Lens Command's selection rules (never password fields, never the clipboard, allow/deny app list). |
| Explorer | **Lens ▸ Micro-save file** or **Micro-save folder** (`--action micro_save "%1"`) |
| Bridge | The new action `micro_save` is answered directly with `{ state: "saved", micro: { id, merged, duplicate, approxTokens } }`. It creates no inbox entry and still counts toward the per-minute rate limit. |

**Hotkey conflict.** Ctrl+Alt+S is already a tiling key in Lens, so the desktop hotkey stays **Ctrl+Alt+Shift+S** (see snippet 2). It needs no new registration.

## Context packs

A pack is a named, ordered bundle of Shelf items with a token budget. The model is `src-tauri/src/shelf/packs.rs`; packs are stored sealed in `%APPDATA%\LensUI\shelf\packs.bin`.

- **Budget meter.** It is green under 80 %, amber up to 100 % and red when over.
- **Trim plan.** One per-item cap is chosen so the pack fits. Only the largest items shrink, and never below 64 tokens.
- **Auto-trim.** The editor summarises over-budget items with the **local** model (`autoTrim` in `src/context/packs.ts`). Items it can't summarise fall back to `head_trim`, which keeps whole paragraphs and adds a visible marker.
- **Copy as Markdown.** Each item comes with its source (`Source: <url> · \`path\` · app`).
- **Send to Claude.** This is `ai_ask({ provider: "claude", context: { shelf_text }, allow_tools: false })`, so Lens AI's privacy mode and consent card still apply. Packs containing local-only items cannot be sent.
- **Open in Claude Desktop.** The pack is copied, and the user is told to attach `lens://pack/<id>` from the Lens MCP server (see snippet 5).
- **Export.** Packs export as `.md` or `.json` (`{ kind: "lens-context-pack", version: 1, pack, items }`).
- **Active context.** One pack can be pinned as active. Lens Command then attaches it automatically with a visible chip (see snippet 3).

The commands are `pack_list|get|create|rename|delete|set_items|add_items|remove_item|set_budget|set_active|active|markdown|export`, and the event is `lens://packs/changed`. The editor is `src/context/PackEditor.tsx`.

## YouTube transcripts (browser extension)

On a YouTube video page, the user picks **Get transcript** from the right-click menu (Lens ▸ Get transcript) or the popup.

1. That click grants `activeTab` for that tab. The extension then injects `src/content/ytPage.js` into the page (world `MAIN`).
2. The script reads the caption tracks the player already has. It picks a human track in the reader's language before an automatic one, then falls back to English.
3. It fetches the chosen track from youtube.com itself, the same request the player makes when captions are turned on.
4. The extension's build check allows exactly this one guarded, same-origin fetch (`NETWORK_EXCEPTIONS`). Any other network call anywhere fails the build.
5. `src/youtube.js` parses json3, srv3 and srv1 into timestamped segments, then into paragraphs (breaking at sentence ends, pauses or every ~60 s).

From there the user can:
- **Add to Shelf**, as a `transcript` item with title, URL, channel and tags;
- **Summarise** (key points);
- **Ask**, with a question field;
- **Copy Markdown**, with clickable `[m:ss](…&t=Ns)` timestamps;
- **Export SRT**.

**No captions.** The panel offers **Transcribe in Lens**, which sends the existing `transcribe` action with the video URL. Lens's transcription then shows its terms notice and needs yt-dlp to be set up; it is off by default.

**Permissions.** None are new: `activeTab` plus the existing optional host permission. The menu item only appears on `youtube.com/watch`, `/shorts/` and `/live/` pages.

## Explorer and desktop

These are additive changes under HKCU, reversible, and every root carries the `LensUIOwned` marker. The plan is `bridge::manifest::explorer_plan_with(exe, hidden)`.

| Where | Verb |
|---|---|
| Files | Ask Lens about this file · **Ask about these files** · Summarise · **Micro-save file** · Add to Shelf · **Add to pack…** · Copy path into context |
| Folders | Ask · **Ask about these folders** · **Micro-save folder** · Add to Shelf · **Add to pack…** · Copy path into context |
| Inside a folder (empty space) | The folder verbs on the open folder (`"%V"`), without "Ask about these folders" |
| Drives | The folder verbs on the drive root, without "Ask about these folders". A drive root reaches Lens as `C:"` (Windows reads `"C:\"` as an escaped quote); `bridge::cli::detect` turns it back into `C:\` |
| Audio/video types | **Get transcript with Lens** (whisper) |
| Desktop background | **Lens Command here** (`--url "lens://command"`) |

**Ask about these files.** The verb uses `MultiSelectModel=Player`. Explorer starts one process per selected item, and the bridge merges `ask_files` requests that arrive within 1.5 s into one pending request (`ipc::coalesce_files`, capped at 100 files). `BridgeContext.files` carries all of them. Browsers can never name files.

**Hidden actions.** Explorer leaves out actions the user hid. Installing reads the preferences, and uninstalling always removes every root Lens owns.

**Existing installs.** `explorerVerbsInstalled` means the menu is on (the file root is Lens's). When an older install lacks a newer place (inside folders, drives), `explorerVerbsOutdated` is true and Connections → File Explorer shows **Update…**, which previews and writes only what is missing; nothing changes until the person confirms.

**Windows 11's compact menu.** Everything above is the classic registry menu, so on Windows 11 it appears under **Show more options** (Shift+F10). A top-level entry in the compact menu needs an `IExplorerCommand` COM handler registered through an app identity: a sparse MSIX package (signed, with `<desktop4:FileExplorerContextMenus>` and `<com:ComServer>` pointing at a small in-process DLL that forwards to `lens-ui.exe --action …`). That needs Authenticode signing, which Lens doesn't have yet (docs/RELEASING.md). Plan, once signing exists: ship the handler DLL and the sparse package with the installer, register it per user on first run when the person turns the Explorer menu on, list it in the change registry, and keep the classic verbs for Windows 10. Until then Settings says where to find it.

## Lens in every menu ("Lens ›")

Lens's own right-click menus end with one **Lens ›** row (the small Lens logo). Hovering it for 160 ms, clicking it, or pressing → / Enter pans the menu sideways into the Magic actions for the same item; ← / Esc / Backspace pan back. Picking an action opens the Magic window for that item and runs it there (answers, confirmations and undo look the same as everywhere else); the last row, **More in Lens…**, opens the Magic window without running anything.

| Where | Its own rows | Then |
|---|---|---|
| Dock app | windows, Min · Max · Top, New Window, Run as Admin, File Location, Unpin… | Lens › |
| Shelf item | Use as context, Copy, Pin/Unpin, Remove | Lens › |
| Notification | (no menu of its own) | right-click opens the Magic window directly |

- **One component.** `src/magic/LensPan.tsx` (`LensPan` wraps a menu's rows; `LensMenuRow` is the row) and `src/magic/LensContextMenu.tsx` for items that had no menu. The panel's rows use the host menu's row class, so they look and navigate like the rest of the menu. Only one panel is in the page at a time.
- **Same rows as the Magic window.** `src/magic/lensPanModel.ts` builds the item's target exactly as `magic::target::resolve` does and lists the window's first six rows (`rowsFor`), honouring your right-click order, hidden actions and Magic's AI setting.
- **Running the pick.** `magic_open({ lens: { …, run } })` carries the row id; the backend accepts only an id-shaped value (`LensTargetInput::run_id`) and passes it in `MagicOpen.run`. The window runs it only when the open came from a Lens menu, is under 5 s old and targets a Lens item (`shouldRun`), so a late `magic_last` can never replay it.
- **Motion.** The panel glides in with transform and opacity, and the menu's box reveals by clip (`captureFlip` "clip"), never layout. Reduced motion makes it instant.
- **Keyboard and screen readers.** The row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`; the panel is a `menu`. Focus moves to the first action when it pans in and back to the row when it pans out; the focus ring shows only for keyboard pans.
- **Shortcuts kept.** Alt+right-click on a Dock app still opens the Magic window straight away, and the global Magic trigger (off by default) is unchanged.
- **Parity.** `tools/parity/magic` scenes `lensMenu`, `lensRowFocus`, `lensPanned` in every preset.

## Snippets for other packages

### 1. Shelf adapter: real micro-save behaviour for bridge requests (`src-tauri/src/app/integration.rs`, `impl ShelfPort for LensShelf`)

```rust
fn micro_save(&self, item: &crate::bridge::protocol::ShelfItem, shelf: Option<&str>) -> Result<crate::bridge::ports::MicroOutcome, String> {
    let input = crate::shelf::micro::MicroInput {
        kind: shelf_kind(&item.kind),
        text: item.text.clone(),
        title: item.title.clone(),
        url: item.url.clone(),
        path: item.path.clone(),
        source_app: item.source_app.clone(),
        ..Default::default()
    };
    let m = crate::commands::rightclick::shelf_micro_save(self.app.clone(), input, shelf.map(str::to_string))?;
    Ok(crate::bridge::ports::MicroOutcome { id: m.id, merged: m.merged, duplicate: m.duplicate, approx_tokens: m.approx_tokens })
}
```

Until this is applied, the trait's default adds a plain Shelf item, so nothing is lost; only the dedup and merge are missing.

### 2. Desktop hotkey (`src-tauri/src/app/integration.rs`, `sync_command_hotkeys`)

Replace the body of the Ctrl+Alt+Shift+S thread with:

```rust
let msg = match crate::commands::rightclick::selection_micro_save(h.clone(), None) {
    Ok(_) => String::new(), // the micro-save toast says it (lens://shelf/micro-saved)
    Err(e) => e,
};
if !msg.is_empty() {
    let _ = h.emit("lens://shelf/notice", msg);
}
```

### 3. Lens Command: auto-attach the active pack

In `src/command/CommandSurface.tsx`, where the context chips are built:

```ts
import { packActive, packMarkdown, onPacksChanged } from "../context/contract";
import { activePackChip } from "../context/packs";
// on mount and on lens://packs/changed:
const view = await packActive();
const chip = activePackChip(view); // { label: "Pack · Name", detail: "4 items · 16k tok", localOnly }
// add a removable chip with source "shelf"; when sending, put `await packMarkdown(view.pack.id)` into context.shelf_text
```

### 4. Control Center mounts

Mount these in the **AI & Command** tab, after `ClipboardCard`:

```tsx
import { ContextMenuCard } from "../context/ContextMenuCard";
import { PackEditor } from "../context/PackEditor";
<ContextMenuCard />
<PackEditor />
```

Mount the micro-save toast once in a surface that is always present, such as the notifications surface or `TopBarSurface`:

```tsx
import { MicroSaveToast } from "../context/MicroSaveToast";
<MicroSaveToast />
```

### 5. MCP: packs as resources and prompts (`src-tauri/src/win_mcp.rs`, owned by the claude-control package)

Replace `"resources/list" | "prompts/list" => rpc_error(…)` with the code below. Also advertise `"resources": {}, "prompts": {}` in `initialize` capabilities.

```rust
"resources/list" => {
    let pdb = crate::shelf::packs::store::read(|p| p.clone());
    let list: Vec<_> = pdb.packs.iter().map(|p| json!({
        "uri": crate::shelf::packs::resource_uri(&p.id),
        "name": p.name,
        "description": format!("Lens context pack · {} items", p.item_ids.len()),
        "mimeType": "text/markdown",
    })).collect();
    Some(rpc_result(id, json!({ "resources": list }), modern))
}
"resources/read" => {
    let uri = params.get("uri").and_then(Value::as_str).unwrap_or("");
    match crate::shelf::packs::parse_resource_uri(uri) {
        Some(pid) => match crate::commands::rightclick::pack_markdown(pid.to_string(), None) {
            Ok(md) => Some(rpc_result(id, json!({ "contents": [{ "uri": uri, "mimeType": "text/markdown", "text": md }] }), modern)),
            Err(e) => Some(rpc_error(id, -32602, &e, None)),
        },
        None => Some(rpc_error(id, -32602, "Unknown resource", None)),
    }
}
"prompts/list" => Some(rpc_result(id, json!({ "prompts": [{
    "name": "use_pack",
    "description": "Answer using a Lens context pack",
    "arguments": [{ "name": "pack", "description": "Pack id (see resources)", "required": true }]
}] }), modern)),
"prompts/get" => { /* pack_markdown(pack) as one user message: "Use this context:\n\n{md}" */ }
```

Two rules for this snippet:
- **Approval.** Reading a pack is read-only, but it is user content. Gate `resources/read` behind the same "Allow AI apps to connect" approval the tools use.
- **Local-only packs.** Never serve a pack whose items are local-only (`PackView.local_only`).

### 6. Lens Browser (`src/browser/*`)

```ts
import { menuFor, recordUse } from "../context/actions";
import { contextMenuGet, contextMenuRecordUse } from "../context/contract";
const { prefs, usage } = await contextMenuGet();
const menu = menuFor({ kind: "selection", surface: "lensBrowser" }, normalisePrefs(prefs), usage);
// render menu.top + a "More" submenu; on click: contextMenuRecordUse(action.id)
```

YouTube in Lens Browser can reuse `extensions/browser/src/youtube.js` (pure) and `content/ytPage.js` (inject into the page).

### 7. Dock, Lens Mini, Shelf, clipboard and notifications

Build each right-click menu with `menuFor({ kind, surface })`:

| Place | Call |
|---|---|
| Shelf item | `{ kind: "shelf", surface: "shelf" }` |
| Clipboard row (`ClipboardPane.tsx`) | `{ kind: "clipboard", surface: "clipboard" }` |
| Notification (`NotificationCenterPane.tsx`) | `{ kind: "notification", surface: "notification" }` |
| Dock app | `{ kind: "app", surface: "dock" }` |
| Lens Mini tiles | `{ kind: "selection", surface: "mini" }` |

Run actions as follows:
- **AI actions:** `ai_ask` with the bridge's prompt wording (`bridge/prompt.rs`), or `expandPrompt` for custom actions.
- **`micro_save`:** `shelfMicroSave({ text, title, url, source_app })`.
- **`pack_add`:** open the pack picker (`packList` + `packAddItems`).
- **`send_claude`:** `claudeRequest(...)`.

Notification and clipboard rows get three entries first: **Add to Shelf**, **Summarise** and **Ask**. Those are the first three applicable catalogue actions with the default prefs.

### 8. CI (optional)

Add a step to `.github/workflows/build.yml` next to the Command parity step:

```yaml
- run: node tools/parity/rightclick/build.mjs && node tools/parity/rightclick/shoot.mjs
```

## Verification

- **TypeScript (bun):** `src/__tests__/rightclick.test.ts` covers the catalogue shape and filtering, ordering, pinning, hiding and learning, custom actions, import/export, Explorer verbs against the catalogue, micro-save toasts, pack budget/trim/auto-trim, Send to Claude, YouTube parsing (json3/srv3/srv1 fixtures), Markdown and SRT, manifest minimality, the network exception, and catalogue sync.
- **Rust:**
  - `shelf::micro` tests: dedup, merge, window, notes, tags, files.
  - `shelf::packs` tests: CRUD, active pack, trim plan, head trim, Markdown, export, prune, resource URIs.
  - `bridge::actions` tests: catalogue parse, consistency with protocol/verbs, file types, preferences and usage.
  - `bridge::manifest` tests: new verbs, `MultiSelectModel`, desktop root, hidden actions.
  - `bridge::ipc` tests: micro-save is answered directly; `ask_files` coalescing.
- **Screenshots:**
  - `node tools/parity/rightclick/build.mjs && node tools/parity/rightclick/shoot.mjs`, covering the card, packs and toasts.
  - `node extensions/browser/tools/shoot.mjs <dir>`, covering the transcript panel and in-page toast.

## Follow-up: clean copy, page archive, clipper templates, double-click define

### Clean copy

**The rules.** `src/context/cleanCopy.rules.json` holds the tracking parameters (`utm_*`, `fbclid`, `gclid`, `mc_*`, `igshid`, HubSpot, Matomo/Piwik, Bing, Amazon and others), per-host parameters, and the "Read more at…" markers.

Some parameters are stripped only on particular hosts. For example, `si` and `feature` are removed on YouTube and Spotify but kept everywhere else.

**Where the rules are used.**

| Code | Function |
|---|---|
| Lens | `src/context/cleanCopy.ts`: `cleanUrl`, `cleanLinksInText`, `stripHijack` |
| Extension | `extensions/browser/src/cleanUrl.js`. Same logic; the rules are copied into `catalog.gen.js`, and a test checks both produce identical results on a table of cases. |

**In the browser.**
- A new **Copy clean link** item (catalogue id `copy_link`).
- **Copy as Markdown** now cleans every link it writes.
- **Clip to notes** sends the cleaned URL.

**Copy guard.** In the extension settings, "Stop sites changing what I copy" is off by default and covers all sites minus the "Never" list and the built-in sensitive list.

`src/content/cleanCopy.js` runs at `document_start`. It adds a capture-phase `copy`/`cut` listener on `window` that calls `stopImmediatePropagation`. The page's handlers never see the event, so the browser copies exactly the selection. It never calls `preventDefault` and leaves editors alone.

Copy buttons that call `navigator.clipboard.writeText` themselves are not intercepted.

### Page archive ("Save page offline")

The extension builds the snapshot with `src/content/snapshot.js`. This is our own approach; SingleFile (AGPL) is not used.

1. Clone the live DOM.
2. Remove scripts, frames, objects, `on*` handlers, `javascript:` URLs and meta refresh.
3. Make all URLs absolute and add `<base>`.
4. Inline same-origin stylesheets.
5. Inline images that are already loaded and same-origin, smallest first, through a canvas as WebP, while the file stays under the cap. Other images keep absolute URLs.
6. Add a script-blocking CSP and a `lens-archive` provenance meta tag.

The snapshot makes no network requests.

**Size caps.** `MAX_ARCHIVE_BYTES` is 420 KB, so one message carries the HTML plus up to 48 KB of readable text.

**What Lens does with it.**
1. The bridge action `archive_save` is accepted only from the browser, and only from this action.
2. `shelf::archive::harden_html` strips scripts, frames, handlers and `javascript:` again, and puts the CSP first in `<head>`.
3. The file is written to `%APPDATA%\LensUI\shelf\archives\YYYYMMDD-HHMMSS-slug.html`, never overwriting.
4. A Shelf `page` item is added with the file `path`, URL, readable text and an `archive` tag.

**Lens Browser (WebView2), snippet:**

```rust
// After the page has loaded, in the Lens Browser webview owner:
webview.CallDevToolsProtocolMethod("Page.captureSnapshot", r#"{"format":"mhtml"}"#, handler);
// handler gets {"data": "<mhtml text>"}:
let (id, path) = crate::commands::rightclick::save_archive_to_shelf(&app, data.as_bytes(), "mhtml", &title, &url, Some(readable_text))?;
```

### Clipper templates

The syntax follows Obsidian Web Clipper (MIT, © Obsidian), credited in `docs/THIRD_PARTY_NOTICES.md`. The parser is our own: `src/context/templates/parser.ts`.

**Variables:** `title url domain author description published site date time selection highlights content tags keywords`

**Filters:** `lower upper title trim slug safe_name date:"YYYY-MM-DD" default:"…" replace:"a","b" truncate:n join:", " split first last blockquote list wikilink link:"text" hashtags yaml_list yaml_string`

`lint` reports unknown variables, unknown filters and unclosed tags.

**Built-in templates** (`templates.ts`):
- "Note with source", with YAML front matter;
- "Highlights only";
- "Reading list line".

**Writing.** Rust `shelf::clipper` stores `clipper.json` with the approved folders and the templates.
- `clipper_folder_approve(folder, confirm)` first returns a question. It approves only on `confirm: true`, and refuses system folders and folders that don't exist.
- `clipper_write` writes only into approved folders, optionally one sub-folder deep. Names are made Windows-safe, and it uses `create_new` so files are never overwritten.

The settings card is `ClipperCard`, with templates, a live preview, approved folders and a confirm card.

**From the browser.** "Clip to notes" sends the bridge action `clip`, delivered to Lens with `meta` holding the author, description, published date, site and keywords from the page's own meta tags and JSON-LD. Lens renders it with `clipFromBridge`. The note is written if the template's folder is approved; otherwise it is shown for approval, or copied.

### Double-click to define or translate

The extension setting "Define or translate on double-click" is off by default. When on, it covers all sites minus "Never" and the built-in sensitive list. It has a "Show first" choice (definition or translation) and a "Translate into" language.

`src/content/define.js` only triggers when:
- the double-clicked text is a single word, 1–40 letters (`defineWordOk`);
- it is not in a sensitive field;
- the site is not denied.

The bubble is in a closed Shadow DOM.

The request is the bridge action `define` with `localOnly: true`. Lens refuses it outright when there is no local engine. It never waits for a cloud confirmation and never falls back to Claude.

**No offline dictionary.** None is bundled. WordNet is redistributable but about 30 MB, so that is left as a decision. Without a local model, the bubble says so.

### Snippets for the follow-up

**9. LensAi** (`app/integration.rs`, `impl AiPort for LensAi`). Until this is applied, `define` is always refused (the safe default).

```rust
fn has_local_engine(&self) -> bool {
    let cfg = self.app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).ai.clone();
    effective_provider(&cfg, true) == "local"
}
```

**10. Lens Command.** On `lens://bridge/request` with `action === "clip"`:

```ts
import { clipFromBridge } from "../context/templates/templates";
const r = await clipFromBridge(req);
if (r.written) addActionCard("Clipped", r.written);
else if (r.pending?.mode === "approve") showConfirmCard(`Save into ${r.pending.folder}?`, () => clipperFolderApprove(r.pending!.folder!, true).then(() => clipFromBridge(req)));
else navigator.clipboard.writeText(r.pending!.body); // no folder chosen: the note is copied
```

**11. Control Center.** Mount `<ClipperCard />` (from `src/context/templates/ClipperCard`) in AI & Command after `PackEditor`.

**12. Clipboard history (optional).** Offer "Paste as clean link" using `cleanLinksInText` in `ClipboardPane`, and the same in `clip::paste::render` for a `clean` paste mode.

**13. Desktop apps.** Double-click define can reuse the selection bubble: `selection_read` → `ai_ask({ provider: "local", … })` with `bridge::prompt` wording for `define`, gated on a local engine. Off by default.
