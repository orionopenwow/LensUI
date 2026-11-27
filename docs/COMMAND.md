# Lens Command

One input, one thread, for everything AI, Shelf and clipboard. Research and design principles:
[COMMAND_RESEARCH.md](COMMAND_RESEARCH.md). Shelf and clipboard contract: [SHELF.md](SHELF.md).

## What it is

- **Modes**, cycled with Tab and Shift+Tab, or by clicking the pill:
  - **Ask**: AI, with `/` commands and `@` context.
  - **Do**: the offline intent engine, with a confirmation for anything that changes settings.
  - **Shelf**: search and use Shelf items.
  - **Clipboard**: history, with type filters.
  - **Actions**: every command, searchable.
- **Context strip.** Chips show exactly what will be sent and where it goes (Local / Offline / Claude):
  - each chip shows its size in tokens;
  - an item marked private by its source app is shown as "stays on this PC" and is dropped from cloud requests;
  - Backspace on an empty input removes the last chip.
- **One thread.** Everything appears as cards in a single timeline: your messages, streamed answers, tool proposals (Do it / Don't), actions taken, and pages sent from the browser. Every answer can be pasted (Ctrl+Enter), copied, sent to the Shelf or retried.
- **Shelf drawer** (Ctrl+B):
  - switch, create, delete and export shelves;
  - tick items, then "Use as context";
  - drop text, links or files in;
  - drag items out to other apps;
  - drag to reorder.
- **Keyboard:**
  - Enter runs. Shift+Enter adds a new line in Ask, or pastes plain text in Clipboard.
  - ↑↓ moves through lists. Esc steps back: closes the popover, stops streaming, clears the input, returns to the default mode, then closes.
  - In Clipboard mode: Ctrl+S sends to the Shelf, Ctrl+P pins, Delete removes, Ctrl+Enter attaches as context.

### Built-in commands

All are local by default; users can choose a different provider per command in Settings.

| Command | Does |
|---|---|
| `/summarise [key points \| tl;dr \| headline]` | Summary shapes borrowed from Chrome's Summarizer API |
| `/explain` | Plain-words explanation with one example |
| `/translate [to <language>]` | Translation only. Multi-word languages need `:` (e.g. `into Brazilian Portuguese: …`) |
| `/rewrite [shorter \| friendlier \| formal \| clearer]` | Result offered for pasting |
| `/fix` | Spelling and grammar only |
| `/todo` | Markdown checklist, saved to the Shelf |
| `/extract [link \| date \| email \| table \| number]` | List, saved to the Shelf |
| `/compare` | Two Shelf items |
| `/ask-page <question>` | Answers from the page sent by the browser |
| `/transcribe <file>` | Calls `transcribe_file` (W6-C) |
| `/note <text>` | Saves to the Shelf |
| `/clip [query]`, `/shelf` | Jump to those modes |
| `/theme …`, `/focus …` | Offline intent engine, with confirmation |

### Your own commands

Add your own in `%APPDATA%\LensUI\commands.json`: a JSON array of templates. The same `id` overrides a built-in, and `"enabled": false` hides one.

```json
[{ "id": "tweet", "name": "Tweet", "description": "Turn it into a post", "provider": "local",
   "template": "Write one post under 280 characters about:\n\n{selection | trim | first:4000}", "output": "paste" }]
```

**Variables:** `{selection}`, `{clipboard}`, `{shelf}`, `{page}`, `{lang}`, `{input}`, `{title}`, `{url}`, `{date}`, `{option}`.

**Modifiers:** `trim`, `upper`, `lower`, `oneline`, `first:N`, `default:"…"`, chained with `|`.

An unknown placeholder is left visible, so mistakes show. The rules are implemented twice, in Rust (`shelf/templates.rs`) and TS (`command/parse.ts`), with matching tests.

## Integration — what the integrator wires

This branch adds the modules and commands only. `lib.rs` registers the commands; `commands/mod.rs` and `src/types/generated.ts` are updated. The integrator applies these snippets.

**1. The window** (`src-tauri/tauri.conf.json`, `app.windows`):

```json
{
  "label": "command",
  "title": "Lens Command",
  "url": "index.html?surface=command",
  "width": 1000, "height": 640, "center": true,
  "decorations": false, "transparent": true, "alwaysOnTop": true, "skipTaskbar": true,
  "resizable": false, "shadow": false, "visible": false, "create": false
}
```

**2. Lazy surface list** (`src-tauri/src/app/setup.rs`): add `"command"` to `LAZY_LABELS` (and change the array length from 6 to 7).

**3. Surface route** (`src/main.tsx`), in the `surfaces` map:

```ts
command: lazy(() => import("./command/CommandSurface").then((m) => ({ default: m.CommandSurface }))),
```

**4. Hotkey and startup** (`src-tauri/src/app/setup.rs`, next to the palette shortcut). Lens Command is off by default. Use the configured hotkey, default `Ctrl+Alt+Space`.

```rust
crate::commands::clip::init(app.handle()); // starts clipboard history if the user turned it on
let cmd_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
let h_cmd = app.handle().clone();
let _ = app.global_shortcut().on_shortcut(cmd_shortcut, move |_app, _s, ev| {
    if ev.state() == ShortcutState::Pressed && crate::load_config().command_enabled() {
        crate::commands::surfaces::toggle_surface(h_cmd.clone(), "command".into());
        let _ = h_cmd.emit("lens://command/open", serde_json::Value::Null);
    }
});
```

For a mode or prefilled text, emit `lens://command/open` with `{ mode: "clipboard" }` or `{ text: "/summarise " }`. The dock sparkle (W6-B) and the `lens://command` URL handler (W6-C) do the same.

**5. Config** (`src-tauri/src/config.rs`), an untyped section so the frontend owns its shape:

```rust
#[serde(default)]
pub command: serde_json::Value,   // in LensConfig; Default = Value::Null
impl LensConfig { pub fn command_enabled(&self) -> bool { self.command.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) } }
```

In `src/types/lens.ts` add `command?: Partial<import("../command/settings").CommandSettings>;` to `LensConfig`.

**6. Control Center** (`ControlCenterSurface.tsx`). In the Windows & Keys tab (or a new "AI & Command" tab, once W6-B's AiCard lands):

```tsx
<CommandCard config={config} onUpdateConfig={updateConfig} />
<ClipboardCard />
```

**7. Swap the AI shim** once `feature/ai-core` merges. Change `./aiShim` imports in `src/command/*` to `../ai/client` and `../ai/contract`; the names match.

**8. Browser bridge.** Command already listens to `lens://bridge/request {id, action, selection?, url?, title?, page_text?}`. Make sure the bridge also opens the window (`toggle_surface("command")`) before emitting.

**9. CI.** `.github/workflows/build.yml` already renders the Command scenes in the parity job (added on this branch).

## Not built yet (specs)

- **Selection without the clipboard.** "Just copied" uses the newest clip if it is under 15 seconds old. A UIA TextPattern reader (`IUIAutomationTextPattern::GetSelection` on the focused element, read-only, no key presses) would make `@selection` work without copying first. It belongs in `clip/win.rs` behind a `clip_read_selection` command.
- **Paste stack.** One hotkey collects copies; another pastes them in order (Paste, Raycast). It needs its own global shortcuts, so it waits for the hotkey registry.
- **OCR of image clips** via `Windows.Media.Ocr`, which is local. Text would then be searchable, as in Raycast.
- **Clip groups.** Ditto/CopyQ-style tabs are covered by Shelves for now.

## Lens Mini, Edge Shelf and selection bar

Everything here is **off by default**, local and reversible. It never runs in fullscreen apps or games, and follows AGENTS.md.

### Lens Mini

**Lens Mini** is the Command window in a compact 376×456 layout. Mini and the full view share the same state and thread, so Expand ↗ only resizes the window (`command_layout`) and swaps the layout in place.

Layout, from top to bottom:

- **Input.** The mode is shown as an icon only.
- **Context.** A chip for the app you're in (category · name), plus the selection read through UI Automation.
- **Actions | Glance tabs.** Tab switches between them.
  - **Actions:** a 2×3 grid of tiles; the arrow keys move between them and Enter runs one. After a run, the latest answer replaces the grid, with Paste, Copy and Shelf buttons.
  - **Glance:** Shelf, clipboard, AI status (provider, model, tokens this session), Now playing, Focus/DND, and a quick note.
    - Now playing uses the existing `get_media_now_playing_cmd` / `media_control_cmd`.
    - Focus uses `get_dnd_cmd` / `set_dnd_cmd`.
    - There is no calendar card: Lens has no calendar data source yet.
- **Shelf strip.** Its cards can be dragged out into other apps.
- **Three recent clips.** Shown only when clipboard history is on.
- **Footer.** Provider, privacy and Expand.

**Tiles are app-aware.** `src/command/contextProviders.ts` mirrors `clip/appctx.rs`:

| Category | Tiles |
|---|---|
| Code editors | Explain · Review · Fix · Ask · Add to Shelf · Summarise |
| Terminals | Explain error (selection only) · … |
| Browsers | Summarise · Ask this page · … |
| Office and notes | Rewrite · Summarise · Fix · Translate · To-do · Add to Shelf |
| Explorer | Summarise · Ask · Add to Shelf · Transcribe · Extract · Compare |

Users choose their base set in Settings. `miniTiles.apps["code.exe"]` and `miniTiles.categories.terminal` hold per-app and per-category overrides.

**Opening Mini.** Emit `lens://command/open` with `{ layout: "mini", anchor: "cursor" | "dock:<x>:<top>" }`. Command calls `command_layout`, which keeps Mini inside the monitor work area: below-right of the pointer, flipping at the edges (`place_near`), or centred above the dock (`place_above`).

### Entry points the integrator wires

**(a) Hotkey tap.** In the Command shortcut handler, a press shorter than 250 ms opens Mini at the cursor; a second tap while Mini is open (or holding the key) opens the full view.

```rust
crate::commands::clip::context_remember();           // the app you came from, before Lens takes focus
let payload = if mini_open { json!({"layout":"full"}) } else { json!({"layout":"mini","anchor":"cursor"}) };
crate::commands::surfaces::open_surface(app.clone(), state, "command".into());
let _ = app.emit("lens://command/open", payload);
```

**(b) Right-click on the dock sparkle.** Mount snippet for `DockSurface.tsx`, or for W6-B's `src/dock/ai/AskDock.tsx`:

```tsx
onContextMenu={(e) => {
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.round(window.screenX + r.left + r.width / 2), top = Math.round(window.screenY + r.top);
  invoke("open_surface", { label: "command" });
  emit("lens://command/open", { layout: "mini", anchor: `dock:${x * devicePixelRatio}:${top * devicePixelRatio}` });
}}
```

**(c) Edge Shelf.** The window config below goes in `tauri.conf.json`. The surface sizes itself from `edgeGeometry.ts` (6×96 tab, 300×420 panel) and hides while `context_foreground().fullscreen` is true.

```json
{ "label": "edgeshelf", "url": "index.html?surface=edgeshelf", "width": 6, "height": 96, "decorations": false,
  "transparent": true, "alwaysOnTop": true, "skipTaskbar": true, "resizable": false, "shadow": false,
  "visible": false, "focus": false }
```

Route it in `main.tsx`:

```ts
edgeshelf: lazy(() => import("./command/mini/EdgeShelfSurface").then((m) => ({ default: m.EdgeShelfSurface }))),
```

Create the window at startup only when `config.command.edge.enabled` is true.

- **Drag in.** Files, text, links and images use WebView2's HTML5 drop (`dataTransfer.files`, `text/plain`, `text/uri-list`).
- **Drag out.** Text and links already work through HTML5 drag. Files need an OLE drag source.

**Plan for dragging files out** (it needs the `Win32_System_Ole` and `Win32_System_SystemServices` features in `Cargo.toml`, so it is left to the integrator):

1. Add `commands::shelf::shelf_drag_files(paths)`, which runs on the UI thread.
2. Build a `CF_HDROP` `DROPFILES` block, wrapped in an `IDataObject` implemented with `#[implement(IDataObject)]` that offers only `CF_HDROP` + `TYMED_HGLOBAL`.
3. Add a minimal `IDropSource` (`QueryContinueDrag` ends on mouse-up or Esc; `GiveFeedback` returns `DRAGDROP_S_USEDEFAULTCURSORS`).
4. Call `DoDragDrop(data, source, DROPEFFECT_COPY)`.
5. Trigger it from the item's `onMouseDown` + 4 px movement, instead of HTML5 `dragstart`, for items of kind `file` or `image`.

Paths must exist and sit outside `%APPDATA%\LensUI\clip`. Only paths the user dropped in earlier are allowed.

**(d) Selection bar (was the selection bubble).** The bubble grew into the Magic selection bar; the full spec and status are in [plans/SELECTION_BAR.md](plans/SELECTION_BAR.md).

- **Window:** `{"label":"bubble","url":"index.html?surface=bubble","width":360,"height":48,"decorations":false,"transparent":true,"alwaysOnTop":true,"skipTaskbar":true,"resizable":false,"shadow":false,"visible":false,"focus":false,"create":false}`. It is shown with `WS_EX_NOACTIVATE` + `SWP_NOACTIVATE` (`commands/selection_bar.rs`), so the app keeps the caret, the selection and the keyboard.
- **Route:** `bubble: lazy(() => import("./magic/selection/SelectionBar")…)`; Magic Search is `magicsearch` (`src/magic/search/MagicSearch.tsx`).
- **Switch:** `config.selectionBar.enabled` (one settings writer, control catalogue). `selection.json` keeps *where* it may read (policy version 2: everywhere except terminals, consoles, remote desktop and VMs; `selection_rules::migrate` upgrades old files without surprises).
- **What the hook sees:** button down/up and moves (to tell a drag from Magic Mouse's hold-then-drag, and how far the pointer wanders while the bar shows), wheel, and — only while the bar shows — keys. A selection is a drag of at least 6 px held at least 80 ms, or a double or triple click, with no modifier held.
- **Reading:** UI Automation `TextPattern.GetSelection` on a worker thread, with a 150 ms timeout, after the configured delay (0–600 ms, default 120). It never uses Ctrl+C or the clipboard to read. The same read reports whether the text is editable and where its lines are.
- **What it refuses:** `IsPassword` fields; Lens's own windows; processes Lens cannot open (elevated or protected); fullscreen apps, games and anti-cheat processes; the clipboard exclusion list; the policy's list.
- **Display:** 8 px below the end of the selection (flipped above near the bottom, clamped to the work area, at the monitor's DPI). The text stays in the backend (one-shot, 60 s) until an action takes it.

**(e) "Add selection to Shelf" hotkey** (suggested Ctrl+Alt+S). It calls `selection_to_shelf()`, which applies the same rules and returns a plain-words error when it refuses.

### App-aware context details

- **Explorer: the selected files.** This needs Shell COM (`IShellWindows` → match the foreground HWND → `IWebBrowserApp::Document` → `IShellFolderViewDual::SelectedItems` → `FolderItem::Path`), which requires the `Win32_System_Ole` and `Win32_System_Variant` features.
  - Plan: add `context_explorer_selection()` next to `context_foreground`.
  - Until then the Explorer tiles act on files dropped onto Mini or copied (clipboard file clips).
- **Terminals:** selection only. Lens never scrapes the scrollback.
- **Browsers:** the page arrives from the Lens extension (`lens://bridge/request`). Mini offers "Ask this page" when one is connected.
