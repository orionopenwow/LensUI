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

**6. Control Center** (`ControlCenterSurface.tsx`). In the Windows & Quick tab (or a new "AI & Command" tab, once W6-B's AiCard lands):

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
