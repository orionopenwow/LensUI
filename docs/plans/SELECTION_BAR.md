# Magic selection bar (plan)

Select text anywhere. When you let go of the mouse, a small Lens bar appears at the end of the selection with Cut, Copy and Paste (only when they'd work), **Magic Search**, and your own actions. Click an action, or use the global hotkey you gave it. Everything about it is customisable, and it belongs to Magic.

| | |
|---|---|
| Status | Plan, 26 Nov 2026; decisions taken the same day (§7). P1 in progress. Off by default when it ships |
| Builds on | The selection bubble (`src-tauri/src/clip/uia.rs`, `clip/selection_rules.rs`, `src/command/mini/BubbleSurface.tsx`, docs/COMMAND.md §d), the one action catalogue (`src/context/actions.ts`, `actions.catalog.json`, `bridge/actions.rs`), the input service (`input.rs`), Magic and LensPan (`src/magic/`) |
| Prior art (learn only, credited) | PopClip (macOS), SnipDo (Windows), Edge's mini menu, Easydict, Raycast's selected-text commands |

## 1. What it looks like

```
  …the quarterly numbers were 12,480 USD across three regions▌
                                                             ╭──────────────────────────────────────────────────────╮
                                                             │ ✂ Cut  ⧉ Copy  ⎘ Paste │ ✦ Magic Search │ Ask  Translate ⌃⌥T  Shelf │ ⋯ │
                                                             │                         ≈ 11,830 EUR                  │
                                                             ╰──────────────────────────────────────────────────────╯
```

- **Shape.** One matte pill (Obsidian, hairline border, no blur) sitting 8 px below the end of the selection, or above it when there's no room. Icons are always shown; labels are optional. An action with its own global hotkey shows it as a small mono hint.
- **Groups.** Clipboard (Cut, Copy, Paste) | Magic Search | your actions | ⋯ More. More pans into the full Magic action list, the same LensPan used by the right-click "Lens ›" item.
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
| Magic Search | Always | Lens Magic Search with the selection (§3.4) |
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

- **No slot keys** (decided). While the bar shows, it claims no keys, so typing always reaches the app and replaces the selection as usual.
- **Direct hotkeys.** Any action can have its own global hotkey (e.g. Ctrl+Alt+T for Translate). It works on the current selection with or without the bar, reading it through the same rules. The bar shows that hotkey as a hint on the action.
- **Conflict check.** It uses the existing shortcuts sheet and `magic/conflicts.rs`, so a hotkey that clashes with Windows, Lens or the foreground app is flagged before it is saved.
- Esc hides the bar. It is only consumed while the bar is visible, and only if the app isn't in the middle of a key sequence.

### 3.4 Magic Search

Lens's own answer to "Ask Gemini" and similar: sleeker and faster, and on any selection in any app.

- **Where it opens.**
  - In Lens Browser, it opens in the browser's agentic side panel.
  - Everywhere else, it opens as a pop-out anchored to the selection: the same matte panel, about 420 × 520, which can grow to a side panel, with × and Esc.
- **What it shows, fast first:**
  1. **Quick answer.** A short, cited summary that streams in. It uses the local model when that's enough, and the configured AI otherwise, under the existing provider and consent rules.
  2. **Aggregated results.** Top web results from several sources, de-duplicated, with site, favicon and snippet, fetched through Lens Browser's search plumbing. Then matches from your own Lens data: Shelf, clipboard history, notes, recent files. Local results are found locally and never sent anywhere.
  3. **Smart cards** when they fit: definition, translation, conversion, maths, map or place, person or company basics, code docs.
- **Full functions:**
  - follow-up questions (a chat thread);
  - Open in Lens Browser;
  - open a result in a split view;
  - Copy answer (with or without sources);
  - Save to Shelf or as a note;
  - Replace the selection with the answer (only in editable text, and asks first);
  - refine the query; "search only my files";
  - Compare sources;
  - pin the pop-out;
  - drag a result to the desktop or into an app.
- **Rules.**
  - Web search and AI use only what you've enabled. The panel shows which provider answered and lists every source.
  - The selection is sent to a cloud service only when the answer comes from one, which the panel states.
  - Nothing runs in the background before you press Magic Search.
- **Also reachable from** Command ("magic search …"), Magic, the Lens › right-click item, voice ("search that"), and its own global hotkey (default proposal: Ctrl+Alt+Space is taken by Command, so Ctrl+Alt+S is suggested, checked for conflicts first).

## 4. Customisation (Settings › Magic › Selection bar)

**Simple:**
- On/off.
- Show labels: off, on hover, always.
- Which clipboard buttons to show.
- Your actions: drag to reorder; add from the catalogue or "New action…" (a prompt template); remove.
- Number of actions shown before More: 3–9.

**Where it works:**
- **Everywhere except an exclusion list** (decided default when turned on). Starting exclusions: the clipboard exclusion list (password managers), terminals and consoles (where selecting already copies), remote-desktop and VM windows, and games. "Only in these apps" is still available.
- Each app can have its own action set ("in VS Code show Explain code, Copy as block").

**Advanced:**
- **Trigger:** drag, double click, triple click; delay; minimum characters.
- **Placement:** below, above, at the pointer.
- **Hiding:** auto-hide time; how far the pointer may move away before it hides.
- **Hotkeys:** each action's direct hotkey (no slot keys).
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
| **P1: the bar** | Replace the dot with the bar (same `bubble` window, wider, non-activating). Cut, Copy and Paste with editable detection. Magic Search button (opens the P1.5 pop-out, or until then Lens Browser's AI panel with the query). Up to 9 catalogue actions, clickable, with optional direct hotkeys. Auto-hide rules. Everywhere-minus-exclusions policy. Settings (simple and "where it works"). Hyper rows and parity scenes in light, dark and every theme pack. E2E in Notepad: select → bar → click Copy → clipboard has it → Esc hides; password field → no bar | M |
| **P1.5: Magic Search** | The pop-out and browser-panel answer described in §3.4: streamed quick answer, aggregated web and local results, smart cards, the full functions | M–L | Works in Notepad, Word and VS Code. Never appears in a password field, elevated app or game. Shows ≤ 200 ms after release on CI |
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

## 7. Decisions (26 Nov 2026)

1. **The search button is Lens Magic Search** (§3.4): an aggregated, cited quick search that is better and sleeker than "Ask Gemini". It opens in Lens Browser's agentic panel, or as a pop-out in any other program.
2. **Default scope when turned on:** everywhere, minus exclusions.
3. **No slot keys.** Actions are clicked, or run with their own global hotkeys.
