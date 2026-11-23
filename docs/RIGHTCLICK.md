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
| Audio/video types | **Get transcript with Lens** (whisper) |
| Desktop background | **Lens Command here** (`--url "lens://command"`) |

**Ask about these files.** The verb uses `MultiSelectModel=Player`. Explorer starts one process per selected item, and the bridge merges `ask_files` requests that arrive within 1.5 s into one pending request (`ipc::coalesce_files`, capped at 100 files). `BridgeContext.files` carries all of them. Browsers can never name files.

**Hidden actions.** Explorer leaves out actions the user hid. Installing reads the preferences, and uninstalling always removes every root Lens owns.

**Existing installs.** The new desktop root means `explorer_verbs_installed` reads false until the user reinstalls once from Connections → File Explorer.

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
