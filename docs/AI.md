# Lens Intelligence (AI core)

Lens Intelligence is the AI layer behind the command palette, the dock assistant, "send to AI" actions from the desktop and browser, and the MCP server. It is **off by default**. Until the user turns it on, nothing touches the network.

- **Providers**
  - **Built-in offline assistant (`script`)**: a deterministic intent engine with no model and no network. It is also the mock provider for tests and CI.
  - **Local model (`local`)**: any OpenAI-compatible server on this PC (Ollama, LM Studio, llama.cpp).
  - **Claude (`claude`)**: the Anthropic Messages API, using the user's own key.
- **Privacy**: `local_only` (the default), `ask_each_time` or `allow_cloud`.
- **Tools**: an allowlist of Lens's own actions, each with a risk level (`low`, `confirm` or `blocked`). The in-app assistant and the MCP server share the same registry.

Code: `src-tauri/src/ai/` (core), `src-tauri/src/commands/ai.rs` (commands), `src/ai/contract.ts` (types and the pure streaming reducer), `src/ai/client.ts` (invoke wrappers and the `useAiRequest` hook).

---

## Contract (fixed; other packages build against it)

Payload fields are snake_case, exactly as written here. Command **arguments** follow Tauri's camelCase conversion, so `ai_confirm_tool(call_id, approve, token)` is invoked as `{ callId, approve, token }`. `src/ai/client.ts` wraps every command, so UI code never spells this out.

### Commands

| Command | Args (JS) | Returns |
|---|---|---|
| `ai_status` | – | `AiStatus { providers: ProviderInfo[], active, privacy }` |
| `ai_set_config` | `{ cfg: AiConfig }` | `void` (sanitised, saved to `LensConfig.ai`, emits `lens://config-updated`) |
| `ai_set_secret` | `{ provider: "claude" \| "local", secret }` | `void`. The key is DPAPI-encrypted under `%APPDATA%\LensUI\secrets\ai-<provider>.bin`. It is never returned or logged; only `has_key` is exposed |
| `ai_clear_secret` | `{ provider }` | `void` |
| `ai_ask` | `{ req: AiRequest }` | request id (`string`). Output arrives as events |
| `ai_cancel` | `{ id }` | `boolean` (false if the id is unknown or already finished) |
| `ai_confirm_tool` | `{ callId, approve, token }` | `void`; errors if nothing is waiting under that id. `token` is the proposal's `approval_token`; an approval without that step's own token does not run the step (docs/AGENT_SAFETY.md "Step tokens"). Declining needs no token |
| `ai_intent` | `{ text }` | `Intent \| null`. Instant and offline (script engine only) |
| `ai_run_intent` | `{ intent: Intent }` | request id. Runs a parsed intent through the **same tool registry and risk gating**, with no model and no network: `low` tools run at once, `confirm` tools emit `tool-proposal` and wait for `ai_confirm_tool`, and results arrive as `tool-result`. The tool's message is then sent as a `delta`, followed by `done` (provider `"script"`). The intent is re-validated in the backend: `_tool` must name a registry tool, unknown arguments are dropped and arguments are schema-checked. Maths and conversions just echo their summary. It works while AI is off (like `ai_intent`), but not when `allow_tools` is false. Added for the surfaces package (PR #12) |
| `ai_usage_log` *(extra)* | `{ limit?: number }` | the most recent usage-log lines (metadata only) |

```ts
ProviderInfo { id, kind: "off"|"script"|"local"|"claude", label, available, model, is_local, needs_key, has_key }
AiRequest   { prompt, context: AiContext, provider?: string, allow_tools: boolean }
AiContext   { selection?, clipboard?, window_title?, app_name?, files?: string[], url?, page_text?, shelf_text? }
Intent      { action, args: { …flat; `_tool` = registry tool that would run it }, confidence, summary }
```

`ai_status` always lists the providers in the order `off`, `script`, `local`, `claude`. `active` is `"off"` while AI is disabled. While enabled, `ai_status` probes the loopback ports to fill in the `local` row (about 0.5 s at most).

`ai_ask` fails immediately (no request id) when:
- AI is off;
- the provider is unknown;
- Claude is chosen in `local_only` mode;
- Claude is chosen but no key is saved.

Every other failure arrives as `done.error`.

### Events

| Event | Payload |
|---|---|
| `lens://ai/delta` | `{ id, text }`: streamed text, in order |
| `lens://ai/done` | `{ id, provider, model, usage?: { input_tokens, output_tokens }, error? }`: always the last event of a request. `error: "Cancelled."` means it was cancelled |
| `lens://ai/tool-proposal` | `{ id, call_id, tool, args, summary, risk: "low"\|"confirm"\|"blocked", approval_token?, plan?: { index, total } }` |
| `lens://ai/tool-result` | `{ id, call_id, ok, message }` |

Each tool call follows the same sequence:
1. A `tool-proposal` is emitted for every call, so the UI can show a timeline.
2. Next comes:
   - `low`: runs straight away.
   - `confirm`: waits for `ai_confirm_tool` with the proposal's `approval_token` (2-minute timeout, which counts as declined).
   - When the model proposes several calls in one turn, they are a **plan**: every call is validated, gated and proposed first (each with `plan: { index, total }`, each waiting step with its own token), then they run in order. Declining one step skips only that step. `src/approval/PlanCard.tsx` shows the plan as one list with an Allow / Deny per step.
   - `blocked`, or arguments that fail validation: never runs.
3. A `tool-result` is emitted with the outcome.

In `ask_each_time` mode, a cloud request first emits a consent proposal. Its `tool` is `"send_to_cloud"`, its `risk` is `"confirm"`, and its `args` are `{ provider, label, model, fields }`, where `fields` lists exactly which context fields would be sent. Approving or declining uses `ai_confirm_tool` as for any other confirm step.

### Config (`LensConfig.ai`)

```ts
AiConfig {
  enabled: false, provider: "script", privacy: "local_only", allow_tools: true,
  claude_model: "claude-sonnet-5-5", max_tokens: 1024,
  local_endpoint: "",          // "" = auto-detect; else a base URL ending in /v1
  local_model: "",             // "" = first chat model listed (embedding models skipped)
  local_allowed_hosts: [],     // non-loopback hosts the user trusts (count as cloud for privacy)
  system_prompt: "",           // the user's own extra instructions (≤ 2000 chars)
  usage_log: true
}
```

---

## Providers

| id | What it is | Where it runs |
|---|---|---|
| `script` | Intent engine plus calculator and unit converter. Commands become tool calls and maths is answered directly. Anything else gets a short "here's what I can do" reply that points to the local and Claude options. It streams in chunks like a real model, so the UI path is the same | On this PC |
| `local` | OpenAI-compatible `POST {endpoint}/chat/completions` with SSE streaming and tool calls. Auto-detection probes `127.0.0.1:11434/api/tags` (Ollama), `:1234/v1/models` (LM Studio) and `:8080/v1/models` (llama.cpp) in parallel with a 450 ms timeout. If the model rejects `tools`, Lens retries once as plain chat | Loopback only, unless the host is listed in `local_allowed_hosts` (then it counts as cloud) |
| `claude` | Anthropic Messages API, `stream: true`, native tool use, `anthropic-version: 2023-06-01`. The key travels only in the `x-api-key` header, over HTTPS only. Redirects are never followed | Cloud |

HTTP uses `reqwest` (blocking, rustls with ring), always on a plain OS thread and never on the async runtime. Tests swap in a `MockTransport`.

## Privacy

- `local_only`: cloud providers are refused before any request is built.
- `ask_each_time`: each cloud request asks first and names the context fields it would send.
- `allow_cloud`: cloud requests run without asking.
- Context is only what the frontend attached. The backend never captures the screen, the clipboard or pages on its own.
- Each context field is size-capped:
  - selection: 12k chars
  - clipboard: 8k
  - page text: 40k
  - files: 25 paths
  - Shelf text (`shelf_text`, added for PR #12): 20k. It is listed in the consent prompt like every other field. PR #12 may also append Shelf text to `page_text`; prefer `shelf_text` so the consent prompt names it
- Context is wrapped in a `<context>` block. The system prompt tells the model to treat it as data, never as instructions. Closing tags inside untrusted text are neutralised so a page can't break out of the block.
- The usage log (`%APPDATA%\LensUI\ai-usage.jsonl`, rotated at 512 KB) records provider, model, token counts, context field *names*, tool names, ok/failed and duration. It never records prompts, answers, context, error text or keys.

## Tools (`src-tauri/src/ai/tools.rs`)

| Tool | Risk | Runs via |
|---|---|---|
| `launch_app {name}` | low | Start-menu app match only (never a path or URL) → `launch_path` |
| `focus_app {name}` | low | open window by app name or title → `focus_window` |
| `close_app {name \| "focused"}` | **confirm** | `WM_SYSCOMMAND SC_CLOSE` (the app can still ask to save) |
| `set_color_mode {mode: dark\|light\|toggle}` | low | apply bridge |
| `set_theme_pack {id}` | low | existing `lens://mcp-apply-pack` (McpBridge) |
| `set_accent {color}` | low | apply bridge |
| `snap_window {slot}` | low | `run_tiling("snap", slot)` |
| `arrange_windows {layout}` | low | tiler |
| `show_desktop {}` | low | apply bridge |
| `set_focus_mode {enabled?}` | low | apply bridge |
| `set_dnd {enabled, minutes?}` | low | `win_notifications::set_dnd` + `lens://dnd-changed`; turns itself off after `minutes` |
| `set_volume {level \| delta}` · `set_mute {muted}` · `set_brightness {level \| delta}` · `set_night_light {enabled?}` | low | quick settings |
| `switch_workspace {target}` | low | workspaces |
| `search_files {query, kind?}` | low | names and paths only, never contents |
| `start_timer {seconds, label?}` | low | apply bridge |
| `open_settings_page {page}` | low | `ms-*` pages open Windows Settings; the rest go through the apply bridge |
| `create_note {text, title?}` | **confirm** | writes `%APPDATA%\LensUI\notes\<ts>-<slug>.md` (never overwrites) |

**Blocked** (never registered; any unknown name is blocked too): deleting, moving or renaming files, emptying the Recycle Bin, sending or posting messages or email, purchases and payments, reading credentials or keys, running shell commands, typing or clicking (raw input), uninstalling, formatting drives, and changing passwords. Tool rounds are capped at 6 per request.

**MCP.** `tools/list` now also offers `launch_app`, `focus_app`, `close_app`, `set_color_mode`, `set_accent`, `snap_window`, `show_desktop`, `set_focus_mode`, `set_dnd`, `set_mute`, `start_timer`, `open_settings_page` and `create_note`. The tools MCP already had (list/focus windows, tile, theme pack, volume, brightness, night light, workspace, search, run_action) keep their names. `confirm` tools join MCP's existing approval queue (Control Center › Agents & MCP). MCP's own "confirm everything" switch still applies on top.

### Apply bridge (frontend wiring — W6-B/C or the integrator)

Some actions live in the UI layer: colour mode, accent, focus mode, Lens settings pages, timers, show desktop, and the "note saved" toast. The backend emits `lens://ai/apply` with `{ tool, args }` for these. Mount one listener in the shell, next to `McpBridge`:

```tsx
// src/components/AiApplyBridge.tsx (suggested)
import { useEffect } from "react";
import { onAiApply } from "../ai/client";

export default function AiApplyBridge({ config, update, openSettings, startTimer, showDesktop }: Props) {
  useEffect(() => {
    const un = onAiApply(({ tool, args }) => {
      switch (tool) {
        case "set_color_mode": /* flip theme scheme: args.mode = dark | light | toggle */ break;
        case "set_accent": /* update({ ...config, theme: { ...config.theme, customAccent: args.color, accentMode: "custom" } }) */ break;
        case "set_focus_mode": /* toggle focus mode (args.enabled?: boolean) */ break;
        case "open_settings_page": openSettings(String(args.page)); break;   // theme, dock, topbar, wallpaper, windows, workspaces, tiling, notifications, plugins, ai, agents, cursor, home
        case "start_timer": startTimer(Number(args.seconds), args.label as string | undefined); break;
        case "show_desktop": showDesktop(); break;
        case "note_saved": /* toast "Note saved" with args.path */ break;
      }
    });
    return () => { un.then((f) => f()); };
  }, [config]);
  return null;
}
```

## Script assistant: what it understands

`ai_intent` actions are listed below. The phrase table in `intent.rs` tests 80 phrasings.

| Action | Examples |
|---|---|
| `open_app` / `switch_app` / `close_app` | "open spotify", "fire up steam", "switch to chrome", "close this window" |
| `set_color_mode` | "dark mode", "switch to light mode", "toggle dark mode" |
| `set_theme_pack` | "apply tokyo night", "use the nord theme", "dracula theme" (all 18 built-in packs, with spoken aliases) |
| `snap_window` / `arrange_windows` / `show_desktop` | "snap left", "move window to the top left", "maximize", "grid layout", "side by side", "show desktop" |
| `set_focus_mode` / `set_dnd` / `set_night_light` | "focus mode on", "help me focus", "dnd on for 30 minutes", "mute notifications", "night light off" |
| `set_volume` / `change_volume` / `set_mute` | "volume 40", "set volume to 75%", "louder", "mute" |
| `set_brightness` / `change_brightness` | "brightness 60", "dim the screen" |
| `switch_workspace` | "workspace 3", "go to desktop two", "next workspace" |
| `search_files` | "find budget.xlsx", "where is my resume" |
| `start_timer` | "timer 5 minutes", "10 minute timer", "remind me in 20 minutes to stretch", "pomodoro", "1h30m" |
| `calculate` | "what's 12*7", "2^10", "15% of 80", "sqrt(16)" |
| `convert` | "5 km in miles", "100 f to c", "how many cm in 3 feet", "2 gb to mb" (length, mass, temperature, volume, speed, data, time) |
| `open_settings_page` | "open display settings", "bluetooth settings", "open dock settings" |
| `create_note` | "take a note: buy milk" |

Filler is stripped first: "hey lens", "please", "can you", "for me" and similar.

## Shared files touched (minimal, to compile and register)

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | `reqwest 0.12` (`blocking`, `rustls-tls`, no default features) |
| `src-tauri/src/lib.rs` | `mod ai;` plus 10 commands in `generate_handler!` |
| `src-tauri/src/commands/mod.rs` | `pub(crate) mod ai;` |
| `src-tauri/src/config.rs` | `LensConfig.ai: AiConfig` (`#[serde(default)]`) and its default |
| `src-tauri/src/win_mcp.rs` | registry tools appended to `tool_defs()`; `ToolCall::Ai`; `McpHost::run_ai_tool` (default: offline error; `LensMcpHost` runs `LensToolHost`); confirm-risk tools go to the approval queue |
| `src-tauri/src/tests/win_mcp.rs` | tool count is now `11 + MCP_EXTRA`; `close_app` is the only destructive tool; new `ai_registry_tools_share_risk_gating` test |
| `src/types/lens.ts` | `LensConfig.ai?: AiConfig` |
| `src/types/generated.ts` | regenerated |

`useLensState.ts` is unchanged: `ai` is optional on the frontend type, and the backend fills in defaults.

## Tests

- **Rust**
  - `ai::intent`: 80-phrase table, non-commands, ambiguity, normalisation
  - `ai::calc`: arithmetic, conversions, durations
  - `ai::sse`: Anthropic and OpenAI streams, tool-call assembly, errors
  - `ai::privacy`: gating, loopback and URL rules
  - `ai::secrets`: round trip, never printed, errors never echo the key
  - `ai::tools`: schemas, risk gating, validation, intent→tool mapping, notes
  - `ai::providers::*`: Claude body, headers and HTTPS rule; local detection, endpoint policy and tool-less retry; script provider
  - `ai::tests`: end-to-end `run_request`:
    - privacy modes
    - confirm, decline and timeout
    - blocked and invalid tool calls from a model
    - round cap
    - cancellation
    - context capping and escaping
    - wire shapes
  - `win_mcp`: the new tools share gating
- **Bun**: `src/__tests__/ai.test.ts` (streaming reducer and helpers).
