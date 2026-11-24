# Guide

The Guide is the built-in helper that teaches Lens: Settings, the dock, Command, the browser
bridge and Windows basics. It is **off until the user turns it on** (Settings › Windows & Quick ›
Guide card, or the first time someone opens it). It works fully offline. When Lens AI is on,
it can also answer in plain sentences, but only from Lens's own help text.

## What it does

- **Search.** Type "how do I…" and get the top three matching settings, lessons or commands. Each
  result shows where it lives (`Settings › Theme & Look › Mouse pointer`) and has a **Show me**
  button.
- **Show me.** Opens the right surface and tab, opens a collapsed Customise section if needed,
  scrolls to the control and draws a calm ring plus a short tooltip. Esc, "Got it" or 7 seconds
  dismisses it. With reduced motion on, the ring doesn't pulse and the scroll jumps.
- **Lessons.** 11 short interactive lessons (`guide/*.md`):
  1. First 5 minutes with Lens
  2. Make it yours (themes, accents, dock, pointers)
  3. Windows like a pro (snapping, Alt+drag, hot corners, workspaces, summon keys)
  4. Your living desktop (Playground, idle mode)
  5. Lens Command, Mini, Shelf and context packs
  6. Right-click everything
  7. Voice control (unlocks when voice lands)
  8. Lens Browser and agent approvals
  9. AI privacy explained
  10. Undo anything
  11. Keyboard map

  Steps wait for the user. A step with a `check` completes by itself when the condition becomes
  true; other steps have "I did it". Every step can be skipped, lessons resume where they were
  left, and progress shows as a ring.
- **Did you know?** Up to two cards about features the user hasn't turned on yet, worked out from
  the local config. "Not now" hides a card for good. Tip of the day is a separate switch, off by
  default, and is never a pop-up.
- **AI answers (optional).** "Explain with AI" sends the question plus the matching Lens help
  snippets, and nothing else, through the normal AI privacy rules (local only, ask each time or
  allow cloud). The model must cite snippets as `[1]`; citations that don't point at a real
  snippet are removed, so **Show me can never point at an invented setting**.
- **Tips for this app.** When AI is on and a third-party app is focused, "Tips for <app>" sends
  only the app's name. It uses the local model by default.

## How it's built

| Piece | File |
|---|---|
| Index builder (settings cards, labels, packs, dock styles, scenes, script commands, shortcuts, user docs, lessons) | `tools/guide/extract.mjs`, `tools/guide/build-index.mjs` |
| Lesson parser | `tools/guide/lessons.mjs` |
| Generated index | `src/guide/index.json`, `src/guide/indexData.ts` (lazy-loaded) |
| BM25 search with synonyms and title-precision ranking | `src/guide/search.ts` |
| Offline answers, grounded prompts, citation checking | `src/guide/answer.ts` |
| Lesson conditions (no `eval`) | `src/guide/conditions.ts` |
| Show me and highlight finding | `src/guide/coach.ts`, `src/guide/CoachMarkLayer.tsx` |
| Panel, drawer, settings card | `src/guide/GuidePanel.tsx`, `src/guide/GuideDrawer.tsx`, `src/components/GuideCard.tsx` |
| Progress (local only) | `src/guide/progress.ts`, `src-tauri/src/guide/mod.rs`, `src-tauri/src/commands/guide.rs` |
| Tips and suggested questions | `src/guide/tips.ts` |
| Anchors list | `src/guide/anchors.ts` |

Rebuild the index after changing settings cards, docs or lessons:

```
node tools/guide/build-index.mjs           # writes src/guide/index.json + indexData.ts
node tools/guide/build-index.mjs --check   # fails if stale (the bun test checks this too)
```

The index is extracted from the source, so it only knows what really exists:

- **Settings.** It reads the Control Center tab list, follows every `<…Card>` / `<…Pane>` /
  `<…Tab>` mount to its file via the import, and collects `cc-label` / `cc-desc` text, row helpers
  (`<Toggle label="…" desc="…">`), Customise section titles and the component's doc comment.
- **Docs.** User docs only. Plans, research and integration notes are excluded, and so are
  developer sections (wiring, tests, contracts).
- **Commands.** Script commands come from the intent parser's own test table, so examples are
  phrasings that are known to work.

### Lesson format

```
---
id: make-it-yours
title: "Make it yours: themes, accents, dock and pointers"
summary: One line for the lesson list.
minutes: 4
order: 2
requires: config.voice exists          # optional; the lesson is greyed out until true
requiresNote: Shown while it's greyed out.
---

## Pick a dock style
show: settings:dock:Dock style         # surface[:tab[:label]] or surface:anchor
anchor: dock.search                    # optional data-guide-id to highlight
check: config.dock.style != floating   # optional; auto-completes the step
success: Message once the check passes.

Step text.
```

Conditions take paths under `config.`, `ui.` (`surface`, `tab`, `focusedApp`) or `wallpaper.`.
They support `== != > < >= <=`, `exists`, `event:<name>`, `&&` and `||`. Events come from
`guideEvent(name)` (see the snippets below).

## Snippets for shared files

Nothing below is applied on this branch. The Guide works without them, except that the drawer
isn't mounted, so nothing opens it in the app yet. The bun tests switch to checking anchors
automatically once any `data-guide-id` exists in the components.

**1. Mount the drawer and card in Settings** (`src/surfaces/ControlCenterSurface.tsx`).

```tsx
import { GuideDrawer } from "../guide/GuideDrawer";
import { GuideCard } from "../components/GuideCard";
import { openGuide } from "../guide/coach";

// Windows & Quick tab, next to <BackupRestoreCard />:
<GuideCard />

// Last child of the Control Center root, so it overlays every tab:
<GuideDrawer config={config} context={{ surface: "settings", tab }} aiEnabled={!!config?.ai?.enabled} />

// "?" button in the Control Center header (anchor settings.help):
<button type="button" className="cc-chip" data-guide-id="settings.help" aria-label="Guide" onClick={() => void openGuide()}>?</button>
```

**2. Nav anchors** (same file, nav buttons). This is optional, because label matching already
finds the nav.

```tsx
<button … data-guide-id={`settings.nav.${n.id}`}>
```

**3. Anchors on other surfaces.** Add the attribute and a `<CoachMarkLayer />` to each surface
root:

| Anchor | Where |
|---|---|
| `dock` | `DockSurface.tsx` root |
| `dock.search` | Dock search / Ask field |
| `dock.sparkle` | Dock AI sparkle button |
| `topbar` | `TopBarSurface.tsx` root |
| `topbar.help` | New "?" button in the top bar: `onClick={() => void openGuide()}` |
| `palette` | `CommandPaletteSurface.tsx` input |
| `command` | `src/command/CommandSurface.tsx` input |
| `mini` | Mini root in `CommandSurface` when `layout === "mini"` |
| `wallpaper` | `WallpaperSurface.tsx` root |
| `browser` | Lens Browser frame (feature/lens-browser), or the extension side panel root |
| `guide` | `GuideDrawer` root (add `data-guide-id="guide"` on `<aside>`) |

```tsx
import { CoachMarkLayer } from "../guide/CoachMarkLayer";
// …inside the surface root:
<CoachMarkLayer />
```

**4. Command `/guide` and "how do I…"** (`src/command/parse.ts` / `CommandSurface.tsx`).

```ts
import { openGuide } from "../guide/coach";
// slash command
{ id: "guide", name: "Guide", description: "Ask how to do something in Lens", builtin: true, enabled: true, template: "", input: "none", output: "thread", provider: "local", options: [] }
// on run:
if (cmd.id === "guide") return void openGuide({ query: rest });
// Ask mode: questions that start with "how do i", "where is", "how can i" and are about Lens
if (/^(how (do|can) i|where (is|are|do i find))\b/i.test(text)) void openGuide({ query: text });
```

**5. Voice** (`feature/voice`). Route the "Lens, how do I …" intent to
`openGuide({ query: transcript })`, and call `guideEvent("voice-intent")` /
`guideEvent("voice-ask")` after a recognised command or question (lesson 7 waits for them).

**6. Lesson events.** Call these one-liners where the action happens:

| Event | Where |
|---|---|
| `guideEvent("palette-opened")` | `CommandPaletteSurface` on show |
| `guideEvent("command-intent")` | Command, after `ai_run_intent` succeeds |

`ui.surface == settings` needs no snippet; the drawer passes it.

**7. Rebuild the index on build** (`package.json`).

```json
"build": "node tools/guide/build-index.mjs && tsc && vite build"
```

**8. Catalogues from sibling packages.** When `src/control/catalogue.json` (feature/claude-control)
lands, `extract.mjs` folds its settings in automatically (`optionalCatalogues`). When the
right-click catalogue `src/context/actions.ts` (feature/rightclick-context) and the voice command
list land, add an extractor next to `extractCommands` that reads them into `kind: "command"`
entries (path `["Right-click", …]` / `["Voice", …]`).

## Shared files changed on this branch

These are the minimum needed to compile and test:

- `src-tauri/src/lib.rs`: `mod guide;` plus 3 commands in `generate_handler!`.
- `src-tauri/src/commands/mod.rs`: `pub(crate) mod guide;`.
- `src/types/generated.ts`: regenerated (`GuideProgress` and 3 commands).
- `.github/workflows/build.yml`: one parity step and one artifact path for the Guide scenes.

## Tests

`src/__tests__/guide.test.ts` (29 tests) checks:

- **Index:** freshness, unique ids and real sources, every mounted settings card indexed,
  developer docs excluded.
- **Golden questions:** the 40 in `guideGolden.ts` must rank their answer first.
- **Lessons:** all 11 parse, every condition is valid, and every lesson Show-me target exists.
- **Grounding:** invented citations are dropped, every Show-me resolves to an index entry, and the
  prompt stays within its budget.
- **Progress, tips and suggested questions.**

Rust: `src-tauri/src/guide/mod.rs` covers defaults, round-trip, camelCase, partial JSON,
sanitising and corrupt-file handling.

Parity (`tools/parity/guide/`) renders each scene in obsidian and alabaster-daylight:

- `home`, `search`, `answer`, `lesson`
- `coach`: the real Control Center with a Show-me highlight on Hot Corners
- `drawer`: the drawer over Theme & Look

`coach` fails if the ring doesn't find its target.
