# Lens AI and agents — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`; Fable pass in PR #114: step-bound approvals, persisted undo, plan view).
Fable pass status lines are marked **[#114]**; they describe the PR branch and are verified by unit tests, the headless parity harness and CI, not yet by hand on a real PC. Sources: `docs/AI.md`, `docs/AGENT_SAFETY.md`,
`docs/MCP.md`, `docs/CLAUDE_CONTROL.md`, `docs/PRESENCE.md`, `docs/VOICE.md`, `docs/AI_SURFACES.md`,
`docs/brain/BUGS.md`, Redline review (2026-11-24), code below.

## 1. Rundown

**What it is.** The AI layer of Lens ("Lens" is also the AI's name): one Ask/Command path with
three providers (on-device script engine, local OpenAI-compatible models, Claude), a set of Lens
tools the AI can call, an MCP server so outside agents (Claude Desktop, Claude Code, others) can
use Lens across your apps, one shared approval card ("Needs your OK"), one agent-safety pipeline
every agent step passes, a presence orb that shows when an agent is acting, and voice.

**Who it's for.** People who want to drive their desktop with an AI they choose, with every
risky step visible and approvable, and nothing leaving the PC without consent.

**Where it lives.**

| Part | Paths |
|---|---|
| AI core | `src-tauri/src/ai/{mod,intent,calc,privacy,secrets,sse,tools}.rs`, `ai/providers/{local,claude,…}.rs`; frontend `src/ai/*` (`AskPanel.tsx`, `client.ts`, `context.ts`, `intent.ts`, `paletteAi.ts`, `usageLog.ts`) |
| Command | `src/command/*` (CommandSurface, Shelf drawer), `app/command_link.rs`, `commands/command_ui.rs` |
| Control (Lens tools, grants, audit) | `src-tauri/src/control/{engine,tools,lens,grants,audit,safety,catalogue,browser}.rs`, `src/control/catalogue.json` (generated) |
| MCP server | `src-tauri/src/win_mcp.rs` (loopback, token, rate limits), `bridge/claude_config.rs` (Claude Desktop entry) |
| Agent safety | `src-tauri/src/agentsafe/{gate,pipeline,hidden_text,domains,confusables,profile,state}.rs` + `fixtures/` |
| Approval | `src/approval/*` (`ApprovalCard.tsx`, `ApprovalSurface.tsx`, `PendingPill.tsx`, `PermissionsCard.tsx`, `LocalApproval.tsx`) |
| Presence | `src-tauri/src/presence/*`, `src/presence/*` (`LensCloud.tsx` orb, `PresenceBar`, `PresenceTwin`) |
| Voice | `src-tauri/src/voice/*` (whisper, grammar, safety, undo…), `src/voice/*` (`VoiceHud`, `Conversation`) |
| Tests | `src/__tests__/ai.test.ts`, `approval.test.ts`, `agentsafe.test.ts`, `presence.test.ts`, `voice.test.ts`; Rust tests in each module; E2E `safety-injection`, `lens-command`, Command intents (35 checks) |

## 2. Feature tree

### 2.1 Providers and privacy
- `script` (intent engine + calculator + unit converter, streams like a model) — works.
- `local` (OpenAI-compatible SSE + tools; auto-detect Ollama 11434, LM Studio 1234, llama.cpp
  8080 in 450 ms; retry as plain chat if tools rejected) — works; loopback only unless in
  `local_allowed_hosts` (then counts as cloud).
- `claude` (Messages API streaming, native tool use, key only in `x-api-key`, HTTPS, no redirects)
  — works.
- Privacy modes: `local_only` (cloud refused), `ask_each_time` (names the context fields),
  `allow_cloud` — works.
- Context caps: selection 12k, clipboard 8k, page 40k, files 25, Shelf 20k; `<context>` wrapper,
  closing tags neutralised — works.
- Usage log without prompts/answers/keys (`ai-usage.jsonl`, rotated 512 KB) — works.
- Secrets stored via `ai/secrets.rs` — works.

### 2.2 Command and Ask
- Ctrl+Alt+Space Command; Do / Ask; intents preview then run; undo — works (35 intent checks
  green after #105).
- First Enter after cold start — **partly**: B-12c (a first synthetic Enter can be lost; real
  keypress unverified).
- Shelf as context, context packs — works.
- Ask panel streaming, stop, retry, copy, markdown-lite — works.

### 2.3 Lens tools (control engine)
- Tools `lens_get`, `lens_set`, theme packs, windows (snap, arrange, focus), media, volume/
  brightness/night light, shelf, snapshots, run_action — works.
- Grants per capability (read_settings, change_look, change_settings, windows, media…) with
  defaults (`CLAUDE_CONTROL.md` "Default grants") — works.
- Undo stack per batch — works; survives a restart **[#114]** (`control/undo.jsonl`, last 50 steps, ≤ 512 KB; window moves stay in memory).
- `type_text` — **not built by design** (Lens never types for an AI yet).
- In-app assistant treats Gate::Ask as run for internal tools (B-35, pinned by a test that every
  mutating `lens_*` is Confirm except `lens_shelf`, `lens_snapshot_save`).

### 2.4 MCP server (Claude Desktop, Claude Code, any MCP client)
- Off by default; loopback; random 256-bit token in `mcp-endpoint.json`; connection without the
  token closed before any message — works.
- No dangerous tools exist (no commands, scripts, file open/delete, window close, process kill,
  account or system settings beyond volume/brightness/night light) — works.
- Validation, 40 calls/min/connection, 4 connections, 256 KB/message — works.
- Audit `mcp-audit.jsonl` shown in the card — works.
- Claude Desktop one-click connect (`bridge/claude_config.rs`), removed by Remove all (B-01) —
  works.
- Windows 11 On-device Agent Registry (MCPB manifest) — **not built**.
- Known limits: `apply_theme_pack` needs the Dock window; app search is name-only.

### 2.5 Agent safety pipeline (all agents: browser agent, MCP, Command plans, voice, Snip, AI runner)
- Rules in order (any block beats any ask): never (sign-in, secret fields, payments unless
  allowed + asked, local-only data leaving, data into links from untrusted text) → injection
  (hidden instructions block writes; plain-sight orders ask; exfil always blocked) → domain risk
  (homograph, `javascript:`) → confused deputy (MCP client acting on another tool's text asks;
  unknown clients ask for writes) → signed-in grants → defaults (send asks with hold; submit,
  delete, download ask) — works; red-team results in `AGENT_SAFETY.md`.
- Discussion-of-injection downgrade (narrow terms only; never for data-moving lines) — works
  (#74 + review).
- Profiles Relaxed / Standard / Strict — works.

### 2.6 Approval card ("Needs your OK")
- Shared card for every agent: who asks, what, risk chip ("Can't be undone"), details, "this
  task can…" caps, Allow for this session, Deny (Esc), hold-to-approve for risky steps — works.
- Pending pill in the Top Bar — works (B-14 fixed: no misleading hotkey).
- Window thumbnail in the card — **partly**: the card accepts `window.thumbnail`, no capture
  command wires it (`CLAUDE_CONTROL.md` "Not yet covered").
- Multi-step plan view (per-step allow/deny) — works (harness, CI) **[#114]**: several steps proposed in one turn are checked and shown whole before any runs (`ToolProposalEvent.plan`); `PlanCard` in the Ask panel and the approval window; denying one step skips only that one. The Command thread still shows one card per step.
- Approvals bound to the exact step — works (CI) **[#114]**: browser agent, assistant runner,
  cloud consent and the shared queue (MCP tools, `run_action`, bridge, Lens Apps) all need the
  card's one-time token (`agentsafe/step_token.rs`, B-50).

### 2.7 Presence (the Lens orb)
- Billowing rainbow Lens cloud (`LensCloud.tsx`, `src/styles/lens-cloud.css`), no spin — works.
- Shows while an agent acts; twin follows the pointer target (transform-only since #75) — works.
- Esc stops a run (global only while a run is active, B-13) — works.
- Ctrl+Alt+Pause pauses; registered in the change registry (#70) — works.
- Capture exclusion, secure-desktop/fullscreen suppression — **needs real hardware**.

### 2.8 Voice
- Push-to-talk / hold, Dock as the voice UI, conversation mode, grammar + fuzzy app names,
  numbers, undo, safety rules — works (unit-tested).
- whisper.cpp local recognition — **blocked for most users**: one-click setup refuses while
  pins are `UNPINNED` (B-07); manual setup via env vars works.
- End-of-speech → action p95 < 400 ms — **unmeasured** (no audio in CI).

## 3. Quick wins (≤ 1 day, ranked)
1. **B-07: pin the three download checksums** (whisper.cpp, ffmpeg, yt-dlp) from official release
   pages — unblocks voice, transcripts and Explorer "Get transcript" in one change.
2. ~~**Step-bound approval tokens**~~ **done in #114** (B-50) for the browser agent and MCP `run_action` (Cleaner-style
   `confirm_token`), so a UI bug can't approve the wrong step.
3. ~~**Persist the undo stack**~~ **done in #114** (B-51) (`control/engine.rs`) to `%APPDATA%\LensUI\undo.jsonl` with a cap,
   so "Undo" survives a restart.
4. **Window thumbnail in the approval card** using `win_previews` capture (already used by the
   Dock hover previews) — makes "close Report.docx" requests unmistakable.
5. **23 swallowed errors** in `src/ai`, `src/approval`, `src/presence`, `src/voice` → toasts.

## 4. Polish assessment
- **Motion:** approval card and orb are on tokens; hold-to-approve progress should be a single
  transform scale (verify no width animation).
- **Copy:** "Needs your OK" is good; risk chips should always pair a reason ("Can't be undone ·
  the app may ask to save"). Consent prompt for cloud names fields — make the field names human
  ("Selected text", "Page text"), not keys.
- **Visual parity:** approval card has parity scenes; add multi-step and every risk level.
- **A11y:** hold-to-approve needs an accessible alternative (Enter twice / long press keyboard);
  verify the card announces risk to screen readers.
- **Perf:** local provider auto-detect 450 ms on first Ask — cache the result for the session.
- **Consistency:** three entry points (Command, Ask panel, Magic Ask) share the client; make sure
  the privacy footer phrasing is identical in all three.

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| B-07 | Medium | `media/setup.rs:197-241` | voice/transcription setup refuses (unpinned) |
| B-12c | Medium | `CommandSurface.tsx` | rare lost first Enter after cold start |
| B-35 | Low | `control/lens.rs run_internal` | Ask treated as run for internal tools (pinned by test) |
| S1 → B-50 | — | browser agent, AI runner, shared queue | **fixed in #114**: step-bound one-time tokens |
| S2 → B-51 | — | `control` undo | **fixed in #114**: bounded journal survives restart |
| Suspected S3 | Low | `win_mcp.rs` known limit | `apply_theme_pack` reports success when the Dock window isn't running |
| Suspected S4 | Low | `ai/providers/local.rs` | auto-detect re-probes each session start; slow first answer on machines without local models |
| B-18 share | Low | 23 sites | swallowed errors |

## 6. One idea to push to main
**Plan view in the approval card — shipped in #114**: when an agent proposes several steps, show them as a list
with a risk chip each and per-step Allow / Deny, approving only the risky ones (hold) while safe
reads run. It's what the site's new example shows, it's what agentic browsers lack, and the
pipeline already classifies each step.

## 7. Test plan
**Unit:** privacy mode × provider matrix; context caps and `<context>` escaping; intent parsing
(extend the 35 checks with negations and multi-intents); approval model (session allow, expiry,
hold timing, keyboard alternative); step-token mint/consume/expire.
**Rust:** agentsafe fixtures (add the 10 browser fixtures + MCP confused-deputy cases with two
clients); MCP rate limits, oversize messages, bad token, unknown tool; grants persistence;
undo persistence; local provider SSE with tool-call fragments and malformed chunks.
**Parity:** approval card every risk level, multi-step plan, long titles, light/dark/high
contrast; presence orb states; voice HUD states.
**Windows E2E:** MCP connect with token → list tools → `lens_set` asks → approve → change applied
→ undo; Claude Desktop config install → Remove all removes it; Command intents (35); presence Esc
stops a run; safety-injection; voice with a fixture WAV once B-07 is fixed.
**Hyper rows:** every `ai.*`, `mcp.*`, `presence.*`, `voice.*` setting set/verify/restore;
invariant "no cloud request when local_only".
**Manual:** Claude Desktop connected to Lens doing a real multi-step task; Ollama auto-detect;
voice push-to-talk on your mic; orb over a fullscreen video (should hide); Ctrl+Alt+Pause.

## 8. Suggested overhaul
- **Phase 1 — Trust:** step tokens, persisted undo, card thumbnails, human field names.
- **Phase 2 — Plans:** multi-step plan approvals; recorded runs (replayable, exportable); per-site
  grants visible in one Permissions page.
- **Phase 3 — Reach:** MCPB manifest for the Windows 11 agent registry (after verifying the
  schema); Claude Code project integration docs; per-client capability presets.
- **Phase 4 — Voice:** pinned whisper setup, wake word off by default, conversation mode in the
  Dashboard.
- **Risks:** any loosening of the safety pipeline; cloud consent drift between entry points.

## 9. Fable pass brief
```
Feature: Lens AI + agents (providers, Command, tools, MCP, agentsafe, approval, presence, voice).
Code: src-tauri/src/{ai,control,agentsafe,presence,voice}/*, win_mcp.rs, src/{ai,approval,presence,voice}/*.
Do:
1. OPEN       Pin B-07 checksums (the release API and Hugging Face were not reachable from the pass's session).
2. DONE #114  Step-bound approval tokens (browser agent, AI runner, cloud consent, MCP queue).
3. DONE #114  Persist the control undo stack (capped jsonl).
4. PARTLY     Human context field names in cloud consent: done. Window thumbnail via win_previews: open.
5. DONE #114  Plan view with per-step allow/deny (Ask panel + approval window; Command thread: open).
6. PARTLY     Ask panel reports an answer that never reached Core; the other 22 sites: open.
Check: bun test src; cargo tests (agentsafe, control, mcp); E2E safety-injection + intents.
Manual: Claude Desktop multi-step task; voice on a real mic.
Don't: add tools that run commands/scripts/delete files; weaken any block rule; log prompts or keys.
```
