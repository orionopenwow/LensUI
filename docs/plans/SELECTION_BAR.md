# Magic selection bar (plan)

Select text anywhere. When you let go of the mouse, a small Lens bar appears at the end of the selection with Cut, Copy and Paste (only when they'd work), Lens Search, and your own actions, each with its hotkey shown. Press the hotkey or click to run an action. Everything about it is customisable, and it belongs to Magic.

| | |
|---|---|
| Status | Plan, 26 Nov 2026. Not built. Off by default when it ships |
| Builds on | The selection bubble (`src-tauri/src/clip/uia.rs`, `clip/selection_rules.rs`, `src/command/mini/BubbleSurface.tsx`, docs/COMMAND.md §d), the one action catalogue (`src/context/actions.ts`, `actions.catalog.json`, `bridge/actions.rs`), the input service (`input.rs`), Magic and LensPan (`src/magic/`) |
| Prior art (learn only, credited) | PopClip (macOS), SnipDo (Windows), Edge's mini menu, Easydict, Raycast's selected-text commands |

## 1. What it looks like

```
  …the quarterly numbers were 12,480 USD across three regions▌
                                                             ╭──────────────────────────────────────────────────────╮
                                                             │ ✂ Cut  ⧉ Copy  ⎘ Paste │ ◎ Search │ Alt1 Ask  Alt2 Translate  Alt3 Shelf │ ⋯ │
                                                             │                         ≈ 11,830 EUR                  │
                                                             ╰──────────────────────────────────────────────────────╯
```

- **Shape.** One matte pill (Obsidian, hairline border, no blur) sitting 8 px below the end of the selection, or above it when there's no room. Icons are always shown; labels are optional; hotkey hints are small mono text.
- **Groups.** Clipboard (Cut, Copy, Paste) | Lens Search | your actions | ⋯ More. More pans into the full Magic action list, the same LensPan used by the right-click "Lens ›" item.
- **Inline preview line.** For content Lens recognises it shows a one-line local result (≈ conversion, = maths, colour swatch, short definition) with no click needed. It is computed locally only.
- **Motion.** It fades and rises 4 px in 140 ms, and leaves the same way. With reduced motion it just appears.

## 2. When it appears and goes away

**Appears** only after a real selection ends, which the existing bubble gesture already detects:
- a drag of at least 6 px held at least 80 ms, or
- a double or triple click,
- then UI Automation (`TextPattern.GetSelection`) confirms non-empty text.

The read runs on a worker with a 150 ms timeout, so the bar shows about 120–200 ms after release. The delay is a setting (0–600 ms).

**Doesn't appear** when:
- a modifier is held;
- Magic Mouse's hold or grab took the gesture;
- the selection is in a password field, a Lens window, an elevated or protected app, or an app on the clipboard exclusion list;
- a fullscreen app, game or anti-cheat process is in front;
- the app's rules say no (`selection_rules.rs`, unchanged and still binding).

**Goes away** on:
- any key that isn't one of its hotkeys (the key still reaches the app);
- a click elsewhere, or scrolling;
- moving the pointer more than about 120 px away;
- the app losing focus;
- the auto-hide timer (default 4 s; can be turned off);
- Esc.

**Never steals focus.** The bar is a non-activating window, so the app keeps its caret and selection, and Cut, Copy and Paste act on the real app.

## 3. Actions

### 3.1 Built in

| Action | Shown when | How it runs |
|---|---|---|
| Cut | The element is editable (UIA `ValuePattern.IsReadOnly == false` or a `TextEditPattern` is present) | Sends Ctrl+X to the app (focus never left it) |
| Copy | Always | Sends Ctrl+C; if the app ignores it, puts the UIA text on the clipboard (plain text) |
| Paste | Editable, and the clipboard has text Lens can paste | Sends Ctrl+V. The hover preview shows the first line of what will be pasted |
| Lens Search | Always | Opens Lens Search with the selection. See §7.1: what "Lens Max search" means is an open question |
| Your actions | Per your list | From the one action catalogue: built-ins (Ask Lens, Explain, Summarise, Translate, Rewrite, Fix grammar, Add to Shelf, Make a note, Define, Open link…) and custom prompt actions (`{selection}` templates) |

### 3.2 Smart actions (content-aware, local)

Lens classifies the selection locally (regex and parsers only, no model) and may add one smart action at the front of "your actions" plus the inline preview:

| Detected | Smart action | Inline preview |
|---|---|---|
| URL | Open in Lens Browser | domain |
| E-mail address | New e-mail (opens the default mail app) | — |
| Number with unit or currency | Convert (opens Command with the conversion) | "≈ 11,830 EUR" (rates cached daily, only if the currency feature is already on, otherwise units only) |
| Maths expression | Copy result | "= 42.5" |
| Date or time | Add to calendar (asks first) | weekday and how far away |
| Colour (#hex, rgb, hsl) | Copy as… (hex / rgb / hsl) | swatch |
| File path that exists | Show in Explorer | file name and size |
| One word | Define (offline dictionary) | first short sense |
| Text in another language | Translate (local model when available) | language name |
| Code | Explain code; Copy as a fenced block | language |

### 3.3 Hotkeys

- **Slot hotkeys.** While the bar is showing, **Alt+1 … Alt+9** run the action in that slot. They're shown on the bar and consumed only while it's visible (claimed on the input service and released when it hides), so they never fight the app at other times. Alt+0 opens More. The scheme is a setting (§4); plain 1–9 is available for people who want it, but not by default, because typing a digit normally replaces the selection.
- **Direct hotkeys.** Any action can also have its own global hotkey (for example Ctrl+Alt+T for Translate). It works on the current selection without the bar, by reading the selection through the same rules. The bar shows that hotkey instead of the slot number when one is set.
- **Conflict check.** It uses the existing shortcuts sheet and `magic/conflicts.rs`, so a hotkey that clashes with Windows, Lens or the foreground app is flagged before it is saved.

## 4. Customisation (Settings › Magic › Selection bar)

**Simple:**
- On/off.
- Show labels: off, on hover, always.
- Which clipboard buttons to show.
- Your actions: drag to reorder; add from the catalogue or "New action…" (a prompt template); remove.
- Number of slots before More: 3–9.

**Where it works:**
- Everywhere except a list, or only in a list; the current allowlist is the starting point.
- Each app can have its own action set ("in VS Code show Explain code, Copy as block").

**Advanced:**
- **Trigger:** drag, double click, triple click; delay; minimum characters.
- **Placement:** below, above, at the pointer.
- **Hiding:** auto-hide time; how far the pointer may move away before it hides.
- **Hotkeys:** the slot scheme (Alt+digit / digit / none) and each action's direct hotkey.
- **Smart actions and inline previews:** on/off, per kind.
- **AI:** provider per action (local / default / Claude), shown on the action; cloud actions follow the existing consent rules.
- **Learn from use** (off by default): floats frequent actions up within your unpinned ones, using local counts only (as in `actions.ts`).

Settings go through the one settings writer and are covered by the control catalogue (so Command, voice and Claude can change them), and they export with the rest of the settings.

## 5. Safety and privacy

- **Reading text.** The selection is read only after a finished selection gesture, through `selection_rules.rs` (password fields, elevated apps, fullscreen, exclusion list, per-app rules). The text stays in the backend until an action takes it (one-shot, 60 s expiry, as today). It is never logged, never saved unless the action saves it (Shelf, note), and never sent anywhere unless the action is a cloud AI action you chose.
- **Clipboard.** Lens never sniffs the clipboard to read a selection (no synthetic Ctrl+C to read). Paste's preview reads the clipboard only while the bar is showing, honouring the "private clipboard" formats password managers set.
- **Keys sent to the app.** Cut, Copy and Paste are sent only on your click or hotkey, only to the app that owns the selection, and never into elevated apps (UIPI blocks it anyway).
- **Approvals.** Any action that sends, books, deletes or signs in still stops on the one approval card.
- **Off switch.** Off by default; turning it off stops the hook claim. Remove all covers it.

## 6. Build plan

| Phase | Scope | Size | Done when |
|---|---|---|---|
| **P1: the bar** | Replace the dot with the bar (same `bubble` window, wider, non-activating). Cut, Copy and Paste with editable detection. Lens Search. Up to 9 catalogue actions with Alt+digit slots. Auto-hide rules. Settings (simple and "where it works"). Hyper rows and parity scenes in light, dark and every theme pack. E2E in Notepad: select → bar → Alt+2 runs → Esc hides; password field → no bar | M | Works in Notepad, Word and VS Code. Never appears in a password field, elevated app or game. Shows ≤ 200 ms after release on CI |
| **P2: smart and personal** | Content detection and inline previews; per-app action sets; direct hotkeys with the conflict check; More → LensPan; drag-to-reorder editor | M | Classifier unit tests (≥ 200 cases). The preview never blocks the bar's appearance (preview arrives later if slow) |
| **P3: everywhere** | Browsers: the Lens extension and Lens Browser render the same bar from the same catalogue and settings (Chromium/Edge UIA coverage checked first). Voice: "translate that", "make that a note" act on the current selection. Learn from use (opt-in) | M–L | Same bar and actions in Lens Browser, Edge and Chrome |

**Files.** These are expected; the dossier confirms them:
- `src-tauri/src/clip/uia.rs` (gesture, editable and readonly probes);
- `selection_rules.rs` (unchanged rules, new fields);
- a new `src-tauri/src/clip/smart.rs` (classifier, pure, tested);
- `src/command/mini/BubbleSurface.tsx` → `src/magic/selection/SelectionBar.tsx`;
- `src/context/actions.ts` (a "selection bar" surface);
- the Settings › Magic page;
- the control catalogue;
- the parity mock;
- `tests/e2e`.

## 7. Open questions

1. **"Lens Max search".** Read here as one search across the web (Lens Browser), your files, the Shelf and clipboard history, with an optional AI answer. Or is "Lens Max" a specific name or mode you have in mind?
2. **Default apps when turned on.** Everywhere except an exclusion list (more useful), or the current allowlist (Office, Notepad, VS Code, Explorer; more cautious)?
3. **Slot keys.** Alt+1…9 by default, as proposed?
