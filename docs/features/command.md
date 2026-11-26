# Command — feature dossier

> Batch 1 of the feature dossiers for the Fable pass. Status words: **works**, **partly**, **broken**, **not built**. Reviewed against `main` on 2026-11-26.
>
> **Fable pass, 2026-11-26 (PR #115): status works.** Done: Snip's default is Ctrl+Alt+X with a one-time move for files still on Ctrl+Shift+S; Save As and other common app keys are on the conflict list by name; the shortcuts sheet shows Snip's real shortcut; "Teach me" (an applied intent says where its setting lives, with a link); the Do-mode preview is announced to screen readers. Example chips under an empty Do field are in too. Left: B-12c by hand on a real PC, the 10 s Undo toast, "Did you mean…", plain-language previews, splitting the two large files.

## Rundown

Command is Lens's "say what you want" surface: type or speak, Lens turns it into an intent, shows a preview, asks for approval when it changes something, does it, and offers Undo. Around it: the command palette (search apps, settings, files, actions), the mini bar, the Shelf drawer (clipboard and dropped items), and global hotkeys.

- **Who it's for:** keyboard people and anyone who'd rather ask than hunt through settings.
- **Front end:** `src/command/CommandSurface.tsx` (1,193 lines: input, preview card, approve/undo), `CommandPaletteSurface.tsx` (534), `src/command/mini/*` (mini bar and expand), `src/command/ShelfDrawer.tsx` (263), `src/command/search*.ts`.
- **Native:** `src-tauri/src/intent.rs` (1,234 lines: parser, 33 ACTIONS, preview/apply/undo through the single config writer), global hotkeys, clipboard watcher.
- **Docs:** `docs/COMMAND.md` (includes unbuilt specs).
- **Tests:** `command.test.ts`, `commandDo.test.ts`, `commandOpen.test.ts`, `mini.test.ts`, `search.test.ts`; perf `command-mini-expand`; E2E `intents.mjs`.

## Feature tree

### 1. Intents
| Feature | Sub / minute | Status | Evidence |
|---|---|---|---|
| Parse | Text → one of 33 actions + args | works | `intent.rs` ACTIONS |
| Preview | Card shows what will change | works | `CommandSurface.tsx` |
| Approve | Changes wait for Enter/click | works | |
| Undo | Restores the previous config | works | `intent.rs` |
| Cold-start keys | First Enter after Ctrl+Alt+Space on a cold start | partly — B-12c open | BUGS.md:48 |
| Settings intents | "dock on the left", "dark mode", "next wallpaper" | works | E2E `intents.mjs` |
| Open intents | Apps, files, settings pages | works | `commandOpen.test.ts` |

### 2. Palette and mini bar
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Palette search | Apps, settings, actions, recent | works | `search.test.ts` |
| Mini bar expand | Small bar grows into full Command | works | perf `command-mini-expand` |
| Keyboard | Arrows, Enter, Esc, Tab to preview | works | |

### 3. Shelf drawer
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Clipboard history | Text, images, files | works | `src/command/ShelfDrawer.tsx` |
| Drop to shelf | Drag files in, drag out later | works | |
| Paste stack | Paste several in order | not built | COMMAND.md spec |
| OCR of image clips | Copy text from a screenshot | not built | spec |
| Clip groups | Named groups | not built | spec |
| Selection without clipboard (UIA) | Act on selected text directly | not built | spec |

### 4. Hotkeys
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Open Command / palette / shelf / snip | Rebindable | works | #99 |
| Conflict check | Warns on clash | works — Snip is on Ctrl+Alt+X; its field names what a clashing choice would break | `src/keys/shortcuts.ts`, `snip/config.rs::migrate`; PR #115 |

## Quick wins (≤1 day each, ranked)
1. ~~Move Snip off Ctrl+Shift+S and add Save As to the conflict list.~~ Done (PR #115).
2. **Show "Undo" for 10 s as a toast after any approved intent**, not only inside the Command card.
3. ~~Example chips under an empty input.~~ Done (PR #115): four examples in Do mode, each a phrase the engine's own tests pin (`src/command/examples.ts`); picking one types it, Enter runs it.
4. **"Did you mean…" for near-miss commands** using the existing search scorer instead of "I didn't understand".
5. **Settle B-12c by hand:** on a real PC, cold start → Ctrl+Alt+Space → type + Enter ten times; if no key is ever lost, close it as a DevTools-only quirk.

## Polish assessment
- **Motion:** mini → full expand within budget; preview card appears without transition — a 120 ms rise would read better.
- **Copy:** previews say "Will set dock.position = left" in places — use plain words ("Move the Dock to the left").
- **A11y:** palette list has roles; preview card lacks `aria-live` so screen readers miss it.
- **Code health:** `CommandSurface.tsx` and `intent.rs` both >1,100 lines; split parser / preview / apply.

## Bug assessment
| Id | Sev | What | Evidence |
|---|---|---|---|
| B-12b | — | First Enter after cold start did nothing — handler side closed (wave 4c) | `docs/brain/BUGS.md:48` |
| B-12c | Low | On some cold starts the very first key sent over DevTools never reaches the page; second Enter works. Maybe CDP-only | `docs/brain/BUGS.md:48` |
| B-37 | — | Fixed | BUGS.md |
| B-45 | — | Fixed (PR #115): Snip's default Ctrl+Shift+S took Save As away from every app | `docs/brain/BUGS.md` |
| — | — | Fixed (PR #115): the Do-mode preview is announced (`role="status"`) | `CommandSurface.tsx` |

## One idea to push to main
**"Teach me" mode.** After an intent is applied, the card shows where that setting lives ("Settings › Dock › Position") with a link — Command becomes the fastest way to learn Lens's settings. **Built (PR #115)** for the offline intents that change a setting (`src/command/teach.ts`, names from the Settings registry). Next: the same line on AI tool cards that change settings.

## Test plan
**Unit:** every ACTION has ≥3 phrasings that parse to it; preview text is plain words for each; apply→undo is identity on the full config for every ACTION.
**Headless / parity:** golden for empty, typing, preview, applied+undo states; perf `command-mini-expand` (exists).
**Windows E2E:** `intents.mjs` (exists, resends Enter only for B-12c) + undo of every ACTION; hotkey conflict detection; shelf drag-in/drag-out with a real file.
**Hyper rows:** Command settings (hotkeys, shelf size, history).
**Owner's PC checklist:**
1. Open Command; type "dock on the left", approve, then Undo.
2. "dark mode at sunset" — check the schedule set.
3. Copy text, an image and a file — all appear in the Shelf.
4. Drag a file from the Shelf to a folder.
5. Press each hotkey in Notepad and Word — no clash.

## Suggested overhaul
**Phase 1 (3 days):** quick wins, B-12c check, plain-language previews, aria-live.
**Phase 2 (1 week):** split `intent.rs` (parse / preview / apply / undo) and `CommandSurface.tsx`; multi-step intents ("focus mode: hide top bar, mute, dark").
**Phase 3 (2 weeks):** paste stack, OCR of image clips (Windows.Media.Ocr, local), clip groups; selection via UIA behind a flag.
**Risks:** UIA selection reads other apps' text — keep it opt-in, local, and off in anti-cheat/fullscreen apps.

## Fable pass brief
```
FEATURE Command / palette / Shelf / hotkeys — docs/features/command.md
STATE   33 intents with preview/approve/undo work; E2E intents.mjs
DO FIRST
 1 Check B-12c on a real PC (cold start, first Enter); close or fix
 2 Snip default off Ctrl+Shift+S; add Save As to conflict list
 3 Undo toast for 10 s after any applied intent
 4 Example chips + "Did you mean…"
POLISH
 - plain-language previews; aria-live on preview; 120 ms rise
IDEA   "Teach me": show where the setting lives after each intent
TESTS  bun test src (command*, mini, search); perf command-mini-expand; E2E intents
OWNER CHECK  5-step list in this file
```
