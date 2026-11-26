# Shelf and clipboard history — contract

The **Shelf** is Lens's "standing clipboard": named collections of context items that stay until you
remove them. **Clipboard history v2** keeps what you copy (opt-in). Both are sealed on disk with DPAPI
under `%APPDATA%\LensUI` and never leave the PC.

Backend: `src-tauri/src/shelf/*`, `src-tauri/src/clip/*`, `src-tauri/src/commands/{shelf,clip}.rs`.
Frontend types: `src/shelf/contract.ts`, `src/clip/contract.ts`. Other packages (browser bridge, AI
surfaces, transcription) build against the Shelf contract below. **Treat it as fixed.**

## Shelf commands (fixed contract)

Argument names are as JS passes them to `invoke` (Tauri maps camelCase to snake_case).

| Command | Args | Returns |
|---|---|---|
| `shelf_list` | `shelf?: string` (omit = all shelves) | `ShelfItem[]`: pinned first, then by order, newest first |
| `shelf_add` | `item: ShelfItemInput`, `shelf?: string` (default `"default"`) | `string`: the new id |
| `shelf_remove` | `id` | — |
| `shelf_update` | `id`, `patch: ShelfItemPatch` | — |
| `shelf_pin` | `id`, `pinned: bool` | — |
| `shelf_clear` | `shelf`, `includePinned?: bool` | `number` removed (pinned items stay by default) |
| `shelves_list` | — | `ShelfInfo[]` with `item_count` and `approx_tokens` |
| `shelf_create` | `name` | `ShelfInfo` (the id is a slug of the name) |
| `shelf_rename` | `shelf`, `name` | — |
| `shelf_delete` | `shelf` | `number` of items deleted. **The UI must confirm first.** The main shelf (`"default"`) cannot be deleted. |
| `shelf_export` | `shelf`, `format: "md" \| "json"` | `string` |
| `shelf_as_context` | `ids: string[]`, `maxTokens?: number` (default 24 000) | `ShelfContext` |

Extras, not part of the fixed contract: `shelf_get(id)` and `shelf_reorder(id, index)`.

Event: **`lens://shelf/changed`** `{ shelf: string | null }` after every change.

```ts
type ShelfKind = "text" | "page" | "selection" | "file" | "image" | "transcript" | "answer";
interface ShelfItemInput { kind: ShelfKind; title?; text?; html?; url?; path?; source_app?; tags?: string[]; local_only?: boolean }
interface ShelfContext { text: string; approx_tokens: number; trimmed: string[]; local_only: boolean; item_count: number }
```

**Rules**

- An item needs text, a URL or a path.
- At most 400 000 characters per item and 1 000 items per shelf.
- At most 50 shelves.
- Tags are lower-cased, de-duplicated and capped at 12.
- If no title is given, Lens uses the first line, else the file name, else the URL.

**Context blocks.** `shelf_as_context` writes each item as:

```
### <Kind> — <title>
Source: <url>        (or File: <path>)

<text>
```

- Each item is capped at 12 000 tokens, and the whole block at `maxTokens`.
- Anything shortened ends with `[… trimmed to fit]` and its id is listed in `trimmed`.
- **`local_only`.** True when any item came from a clip its source app marked "do not sync". **Callers must not send such a block to a cloud provider.** Lens Command enforces this itself.

**Token estimate.** About four characters per token for Latin script, one per character for CJK and other wide scripts. Rust (`approx_tokens`) and TS (`approxTokens`) use the same rule, and both are tested.

## Shelf → Notes (Magic waves M4, off by default)

With **Shelf to Notes** on, the Shelf drawer has **Make a note**. It builds one note from the ticked
items (or the whole shelf when none are ticked) and shows it before anything happens:

- **Save to Notes** — a text item tagged `lens-note` in the "Notes" shelf, like any note made in
  Lens Notes.
- **Export .md / .txt / PDF** — written by `save_note_export` into Downloads (or
  `%APPDATA%\LensUI\exports` when there is no Downloads folder). Names are cleaned, nothing is
  overwritten, PDFs must be real PDFs (`src/shelf/pdf.ts`, A4, Helvetica, Windows-1252 text).
- **Send to a contact** — Matrix rooms you can reply in only. The exact text is shown on an approval
  card; nothing is sent until you hold **Send**, and "Don't send" withdraws the request
  (`messages_send` request → `feeds_approve` → send, once).

The optional AI summary is not built yet. Tests: `src/__tests__/shelfNotes.test.ts`.

## Clipboard history v2

| Command | What it does |
|---|---|
| `clip_status()` | Enabled, paused-until, skip-next, counts and settings. It also wires change events on first use. |
| `clip_set_settings(settings)` | Saves `%APPDATA%\LensUI\clip\settings.json`. Turning history on starts the listener; turning it off stops recording immediately. |
| `clip_list(query?, kind?)` | `ClipView[]`: pinned first. The preview is capped at 240 characters, and the full text never goes to the list. |
| `clip_get_text(id)` | The full text, for previews and context chips. |
| `clip_pin`, `clip_rename`, `clip_delete` | Single-clip edits. |
| `clip_clear(minutes?, includePinned?)` | Clears recent clips. Pinned clips stay unless `includePinned`. |
| `clip_wipe()` | Deletes everything, in memory and the sealed file. |
| `clip_pause(minutes)`, `clip_ignore_next()` | Pause recording (`0` resumes) or skip one copy. |
| `clip_copy(id, mode?)` | Puts the clip back on the clipboard. |
| `clip_paste(id, mode?)` | Hides Command, then sends Ctrl+V to the window you came from. It never sends to a Lens window, and only runs after the user picks a clip. |
| `clip_paste_text(text)` | The same, for an answer or a Shelf item. |
| `clip_merge(ids)`, `clip_to_shelf(ids, shelf?)` | Merge clips into one text; save clips to a shelf. |

Event: **`lens://clip/changed`**.

`mode` is one of:

- `original`: text plus its HTML.
- `plain`
- `markdown`: HTML converted locally, links titled.
- `trimmed`: each line trimmed, at most one blank line.

**What is never recorded**

- **The three Windows private formats** (Microsoft Learn, "Clipboard Formats"):
  - `ExcludeClipboardContentFromMonitorProcessing`: anything present means skip.
  - `CanIncludeInClipboardHistory = 0`: skip.
  - `CanUploadToCloudClipboard = 0`: kept, but marked **local only**, and never sent to a cloud AI.
- **`Clipboard Viewer Ignore`.**
- **Copies from excluded apps.** The 12 password managers in `clip::privacy::DEFAULT_EXCLUDED_APPS` are excluded by default; users can add or remove apps.
- **While paused, or the single copy after "skip next".**
- **Anything larger than the item cap** (2 MB by default).

**Retention.** Keep for 1 day / 1 week / 1 month / 3 months / until full, with an item cap of 100–10 000 and a 64 MB total. Pinned clips never expire.

**Storage.** `%APPDATA%\LensUI\clip\history.bin` and `%APPDATA%\LensUI\shelf\shelves.bin`.

- **Container:** `LENSSEAL` · version · scheme (1 = DPAPI current user, with Lens-specific entropy) · payload.
- **Unreadable files** (another user, corruption) are renamed to `*.unreadable`, never overwritten.
- **Saves are atomic:** write to a temp file, then rename.

## Retiring the old in-memory history

`win_clipboard.rs` (the text-only, in-memory history behind the Clipboard pane) still runs on its own
`func.clipboardHistory` switch. Both listeners can run side by side. Once Command ships:

1. Point `ClipboardPane.tsx` at `clip_list`/`clip_copy`.
2. Map `func.clipboardHistory` onto `ClipSettings.enabled` once (a migration in `config.rs`).
3. Remove `start_clipboard_history` from setup.
