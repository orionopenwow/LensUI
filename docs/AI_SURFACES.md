# AI surfaces (W6-B)

The frontend for AI in Lens: the Ask panel, palette results, the Dock's Ask mode, suggested apps,
drop-to-AI, "what was I doing?", the AI settings card, and quick actions.

AI is **off by default**. The rest of this page says how each piece behaves, what it may send, and the
exact code to mount it. That code goes in files other agents own (DockSurface, CommandPaletteSurface,
ControlCenterSurface, NotificationCenterPane, ClipboardPane).

## 0. Contracts and shims

| Shim (delete when the real one lands) | Real module | Branch |
|---|---|---|
| `src/ai/contract.shim.ts` | `src/ai/contract.ts` (types) + `src/ai/client.ts` (functions, `useAiRequest`) | feature/ai-core (W6-A) |
| `transcribeFile` in `contract.shim.ts` | W6-C client | W6-C |
| `src/ai/shelf.shim.ts` | Shelf client | feature/shelf-command |

To swap a shim:

1. Replace `from "./contract.shim"` / `"../../ai/contract.shim"` / `"../ai/contract.shim"` with the real
   modules.
2. Check the `invoke()` argument names. The shim guesses `request`, `provider`, `secret`, `id`, `callId`,
   `approve`, `text`, `path`, `options` and `config`; client.ts is authoritative.
3. Delete the shim.

The surfaces use only these names: `aiStatus`, `aiAsk`, `aiCancel`, `aiConfirmTool`, `aiIntent`,
`aiSetConfig`, `aiSetSecret`, `aiClearSecret`, `transcribeFile`, `useAiRequest`, `AI_EVENTS`, plus the
types.

If client.ts's `useAiRequest` returns a different shape, keep the shim's hook as `src/ai/useAiRequest.ts`.
It only uses `aiAsk`, `aiCancel`, `aiConfirmTool` and the four events.

**Optional fields the card uses when present:**
- `ai_status` providers may carry `models: string[]`, which becomes the model dropdown.
- `ai_status` may carry `tools`, which supplies the saved tool permissions.

**`ai_set_config` payload sent by AiCard:**
`{ active, privacy, tools: { settings, windows, launch, titles }, models: { [providerId]: model } }`.

**Shelf → AI context.** The AI contract has no shelf field yet. Attached Shelf items are resolved with
`shelf_as_context(ids)` and appended to `context.page_text` under `--- From your Shelf ---`. If W6-A adds
`context.shelf_ids`, change `doSend` in AskPanel to pass ids instead.

## 1. Ask panel — `src/ai/AskPanel.tsx`

```tsx
<AskPanel
  initialPrompt="…" initialContext={{ selection, clipboard, window_title, app_name, files, url, page_text }}
  initialShelfIds={["…"]} autoSend compact={false}
  onClose={…} onOpenSettings={() => openSettingsAt("ai")}
/>
```

**What it shows:**
- Streaming text with Markdown-lite, which builds React elements (never `innerHTML`; only http(s)
  links).
- Context chips with removable previews, and Shelf chips with a dashed outline.
- A size estimate (≈ tokens) that turns amber above 8k.
- A provider badge that doubles as the provider picker, and a privacy indicator.

**What it gates:**
- **Consent card** for cloud sends when privacy is "ask each time". It lists every attachment and the
  size, and offers "Use Ollama instead".
- **Blocked card** when privacy is "local only".
- **No-provider and needs-key cards.**

**Tool proposals:** Approve/Deny cards, risk-coloured low (green), medium (amber) or high (red).

**Answer bar:** Copy · Retry · **Add to Shelf** · **Open in Lens Command** · Continue in Claude (copies
the prompt, attachments and answer).

**Follow-ups:** they include the last 2 turns (≤ 4k chars), because the backend has no session memory.

**Keyboard:**
- Enter sends; Shift+Enter adds a new line.
- Esc stops the answer, then closes the panel.
- `@` opens the Shelf picker (↑/↓ to move, Enter/Tab to attach, Esc to dismiss).

**Usage log:** each finished request is logged locally (`src/ai/usageLog.ts`) with time, provider,
model, cloud flag and tokens. Prompts and answers are never logged.

**Lens Command.** "Open in Lens Command" emits `lens://command` with this payload:

```ts
{ action: "continue", prompt, answer?, context, shelf_ids, provider? }
```

The Command surface should listen for it, show itself, and seed its thread. Override it with
`onOpenInCommand` if the surface prefers a direct call.

**Cards match the Command thread.** `.ai-card`, `.ai-tool`, `.ai-chip`, `.ai-btn` and `.md*` live in
`src/ai/AskPanel.css` and use only Lens tokens. The Command surface should import that CSS and reuse
`MarkdownLite`, `ToolCard`-style markup and the same class names, so a conversation looks identical in
both places.

## 2. Palette — `src/ai/paletteAi.ts`

Routing (`src/ai/intent.ts`):

| Query | Behaviour |
|---|---|
| `ai: …`, `ask: …`, `/ask …`, `@ai …`, `@claude …` | Exclusive "Ask AI" row |
| Imperative ("turn on night light", 2+ words) | Lens's own NL plan wins. Otherwise `ai_intent` runs (debounced 220 ms) and a **Do it** row appears. Enter runs it if confidence ≥ 0.75 and the action isn't risky; otherwise it needs Enter twice. |
| Question (ends with `?`, or starts with how/why/what… and has 3+ words) | "Ask AI" at the top |
| Other 3+ word text | "Ask AI" at the bottom, above web search |
| `>`, `?`, `=` | Never touched (shell, web, calculator) |
| `clipboard` / `clip` | Clipboard quick actions (explain, translate, fix grammar, make a to-do) |

### CommandPaletteSurface snippet

```tsx
import { useAiPaletteItems } from "../ai/paletteAi";
import { AskPanel } from "../ai/AskPanel";
import { aiAsk } from "../ai/contract.shim";
import { parseNaturalLanguageActions } from "../utils/nlActionRouter";

const aiOn = useAiEnabled();                // aiStatus().active !== "off", refreshed on focus
const [askPrompt, setAskPrompt] = useState<string | null>(null);
const ai = useAiPaletteItems(
  query,
  { enabled: aiOn, hasLocalPlan: parseNaturalLanguageActions(query).length > 0 },
  useMemo(() => ({
    openAsk: (p: string) => setAskPrompt(p),
    // Until client.ts exposes ai_run_intent: ask with tools so the user approves the proposed call.
    runIntent: (_i, text) => setAskPrompt(text),
  }), [])
);
// merge: exclusive AI results replace the list; otherwise put special:"top" items first and "bottom"
// items before the web-search row.
const merged = ai.exclusive ? ai.items : mergeSpecials(filtered, ai.items);

// When askPrompt is set, render the panel in place of the result list (Esc returns to results):
{askPrompt !== null ? (
  <AskPanel key={askPrompt} initialPrompt={askPrompt} autoSend onClose={() => setAskPrompt(null)} />
) : (/* existing results */)}
```

`useUnifiedSearch` can do the merge instead. Add `extraItems?: SearchItem[]` to its options and push them
before `rankItems`. Specials keep their place by rule.

## 3. Dock

The Dock pill is already `position: relative` and has a locked width. Nothing below changes the width.

### 3a. Ask mode — `src/dock/ai/AskDock.tsx`

The current DockSurface keeps its own input, so add the toggle and branch on the mode:

```tsx
import { AskModeToggle, AskDockPopover, useAskMode } from "../dock/ai/AskDock";
const askMode = useAskMode(aiOn);           // Tab toggles when AI is on
const [askOpen, setAskOpen] = useState<string | null>(null);

// on the existing <input className="dock-search-glide-input">:
placeholder={askMode.mode === "ask" ? "Ask anything…" : "Search…"}
onKeyDown={(e) => {
  if (askMode.onKeyDown(e)) return;                       // Tab
  if (askMode.mode === "ask" && e.key === "Enter" && dockSearchQuery.trim()) {
    e.preventDefault(); setAskOpen(dockSearchQuery.trim()); return;
  }
  /* existing Escape / arrows / Enter */
}}
// right after the input, before the ESC button:
{aiOn && <AskModeToggle mode={askMode.mode} onToggle={askMode.toggle} />}
// in search mode keep the results drawer; in ask mode hide it.

// inside the .dock-pill, anywhere:
<AskDockPopover open={askOpen !== null} prompt={askOpen ?? ""} onClose={() => setAskOpen(null)}
  edge={dockEdge /* bottom|top|left|right */} onOpenSettings={openAiSettings} shelfIds={pendingShelfIds} />
```

Dock styles that use the glide bar (`.dock-search-glide-bar`) can drop in `<AskDockField>` instead. It
has the same size and animation as the glide bar, plus the toggle and a "Tab" hint. The popover's Ask
panel supports `@` to attach Shelf items to follow-ups.

### 3b. Suggested apps — `src/dock/ai/SuggestedApps.tsx`

```tsx
import { SuggestedApps, recordDockLaunch } from "../dock/ai/SuggestedApps";
// wherever the Dock launches an app:
recordDockLaunch({ key: app.path.toLowerCase(), name: app.name, path: app.path });
// after the pinned apps, before the divider:
<SuggestedApps enabled={!!config.dock.suggestedApps /* default false */}
  exclude={[...pinnedPaths, ...runningExePaths].map((p) => p.toLowerCase())}
  iconFor={(p) => pinnedIcons[p]} onLaunch={(s) => invoke("launch_app_cmd", { path: s.path })} />
```

- Config: add `dock.suggestedApps?: boolean` (default false) and a toggle under Dock → Behaviour:
  "Suggest apps you usually open now".
- Model: frequency × hour fit (±1 h) × weekday/weekend fit × recency. It has a 14-day half-life, a
  minimum of 3 launches and a 200-app cap.
- Storage: `localStorage["lens.ai.predict.v1"]`. Expose `forgetModel()` as a "Forget" button.
- Tooltip: custom, not `title=` (AGENTS.md); it explains why ("You usually open Slack around 9 AM on
  weekdays").

### 3c. Drop-to-AI — `src/dock/ai/DropToAi.tsx`

```tsx
import { DropSparkle, DropToAiMenu } from "../dock/ai/DropToAi";
// next to the search button (or as the last item when AI is on):
<DropSparkle active={dragOverSparkle} onClick={() => openInDockLauncherInAskMode()} />
// the Dock's Tauri drag-drop handler already gives paths; when they land on the sparkle:
{droppedPaths && <div className="dock-ai-drop-anchor"><DropToAiMenu paths={droppedPaths}
  onClose={() => setDroppedPaths(null)} onAsk={(prompt, ctx) => { setAskCtx(ctx); setAskOpen(prompt); }} /></div>}
```

- Menu: Summarise, Transcribe (media only; a "+ .srt" toggle), Suggest better names, Ask about it…, Add
  to Shelf.
- Transcribe: calls `transcribe_file` and shows `lens://transcribe/progress` live. When it's done, the
  transcript opens in the Ask panel for a summary, or goes to `onTranscript`.
- Pass `context={askCtx}` to `AskDockPopover` (add the prop pass-through, or render `<AskPanel
  initialContext>` directly).

### 3d. "What was I doing?" — `src/dock/ai/WindowGroups.tsx`

```tsx
<WindowGroups windows={runningWindows} provider={activeProvider} privacy={status.privacy}
  onFocusWindow={(hwnd) => invoke("focus_window_cmd", { hwnd })} onAsk={(p, ctx) => openAsk(p, ctx)} />
```

- Mount it in the widget drawer, or in the Dock's right-click "Windows" menu.
- Summarise is disabled with an explanation unless the provider is local or script, or privacy is
  "allow cloud" (`canSendTitles`).
- Respect AiCard's `tools.titles` toggle: don't mount it when that's off.

## 4. AI settings card — `src/components/AiCard.tsx`

ControlCenterSurface, in the Functions (or a new "AI") section, above McpCard:

```tsx
import { AiCard } from "../components/AiCard";
<AiCard onTryIt={() => invoke("show_surface", { label: "palette" })} />
```

**Who answers:**
- Off by default.
- Turning it on picks a local model first, then the script helper.
- Each provider row has a live availability dot, a Detect button, a model dropdown, and a Test button
  (sends "Reply with the single word OK.").

**Claude key:**
- A password field.
- The note "stored encrypted on this PC (Windows DPAPI)".
- "Key saved · never shown again" and a Remove key button.
- A "Get a key" button that opens console.anthropic.com in the browser via `launch_app_cmd`.

**Privacy:** three plain-words choices.

**AI may suggest:** toggles for settings, windows, apps/files and window titles.

**Information panels:**
- A "What can AI see?" explainer.
- A usage log with totals and a Clear button.

**First-run explainer:** shown once, when AI is first turned on (`localStorage["lens.ai.introSeen"]`).

## 5. Quick actions — `src/ai/actions.ts`

**Clipboard actions:** `clipboardActions()`: Explain, Translate (target language), Fix grammar, Make a
to-do. Each attaches only `{ clipboard }`.

ClipboardPane snippet (per entry):

```tsx
{aiOn && clipboardActions().map((a) => (
  <button key={a.id} className="ai-chipbtn" onClick={() => { const r = a.build({ text: entry.text }); openAsk(r.prompt, r.context); }}>{a.short}</button>
))}
```

**Notification digest:** `notificationDigest(items)` returns a prompt plus `{ page_text }`. It takes the
40 newest items and cuts each body to 200 chars.

NotificationCenterPane header snippet:

```tsx
{aiOn && items.length > 2 && (
  <button className="ai-chipbtn" onClick={() => { const r = notificationDigest(items.map(toDigest)); openAsk(r.prompt, r.context); }}>
    <Sparkles size={12} /> Summarise
  </button>
)}
```

## 6. Tests and parity

- `bun test`:
  - `aiPredict.test.ts`: the predictor.
  - `aiIntent.test.ts`: routing, intent gating and palette items.
  - `aiContext.test.ts`: chips, privacy gate, hand-off, tokens, Shelf @-mentions, Markdown-lite, quick
    actions, digest, window groups.
- Parity gallery, separate from the surface harness so it needs no `main.tsx` changes:

  ```
  node tools/parity/ai/build.mjs && node tools/parity/ai/shoot.mjs
  ```

  - It renders 19 states in Obsidian and Alabaster Daylight.
  - It fails on any page or console error.
  - It writes `tools/parity/ai/shots/contact-<preset>.png`.
  - The mock backend (`tools/parity/ai/mockCore.ts`) streams canned Markdown, emits a medium-risk tool
    proposal and its result, errors on request, handles intents ("night light"), fakes transcription
    progress and serves a sample Shelf.
- To run it in CI, add after the existing parity steps in `.github/workflows/build.yml`:

  ```yaml
  - name: Render AI surfaces
    run: node tools/parity/ai/build.mjs && node tools/parity/ai/shoot.mjs
  ```

  and add `tools/parity/ai/shots/` to the uploaded artifact.
