/**
 * TEMPORARY SHIM: the Lens AI backend contract (W6-A, branch feature/ai-core), copied verbatim so the AI
 * surfaces can be built and tested before the backend lands.
 *
 * When feature/ai-core merges, the integrator deletes this file and points imports at
 * `src/ai/contract.ts` (types) and `src/ai/client.ts` (functions + hook). The exported names below match
 * those files on purpose: `useAiRequest`, `aiAsk`, `aiIntent`, `aiStatus`, `aiConfirmTool`, `aiCancel`,
 * plus `aiSetConfig`, `aiSetSecret`, `aiClearSecret` and `transcribeFile` (W6-C).
 *
 * Contract (verbatim):
 *   commands
 *     ai_status -> { providers: [{ id, kind: "off"|"script"|"local"|"claude", label, available, model,
 *                    is_local, needs_key, has_key }], active, privacy: "local_only"|"ask_each_time"|"allow_cloud" }
 *     ai_set_config
 *     ai_set_secret(provider, secret)
 *     ai_clear_secret
 *     ai_ask({ prompt, context: { selection?, clipboard?, window_title?, app_name?, files?, url?, page_text? },
 *              provider?, allow_tools }) -> id
 *     ai_cancel
 *     ai_confirm_tool(call_id, approve)
 *     ai_intent(text) -> { action, args, confidence, summary } | null
 *   events
 *     lens://ai/delta          {id, text}
 *     lens://ai/done           {id, provider, model, usage?, error?}
 *     lens://ai/tool-proposal  {id, call_id, tool, args, summary, risk}
 *     lens://ai/tool-result    {id, call_id, ok, message}
 *   W6-C (transcription)
 *     transcribe_file(path, {model?, language?, translate?, srt: bool}) -> job id
 *     lens://transcribe/progress {id, pct, stage}
 *     lens://transcribe/done     {id, text?, srt_path?, error?}
 *
 * Argument names passed to invoke() (`request`, `provider`, `secret`, `id`, `callId`, `approve`, `text`,
 * `path`, `options`, `config`) are the shim's best guess; client.ts is authoritative.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ---------------------------------------------------------------- types

export type AiProviderKind = "off" | "script" | "local" | "claude";
export type AiPrivacy = "local_only" | "ask_each_time" | "allow_cloud";

export interface AiProviderInfo {
  id: string;
  kind: AiProviderKind;
  label: string;
  available: boolean;
  model: string;
  is_local: boolean;
  needs_key: boolean;
  has_key: boolean;
}

export interface AiStatus {
  providers: AiProviderInfo[];
  active: string;
  privacy: AiPrivacy;
}

export interface AiContext {
  selection?: string;
  clipboard?: string;
  window_title?: string;
  app_name?: string;
  files?: string[];
  url?: string;
  page_text?: string;
}

export interface AiAskRequest {
  prompt: string;
  context: AiContext;
  provider?: string;
  allow_tools: boolean;
}

export interface AiIntent {
  action: string;
  args: Record<string, unknown>;
  confidence: number;
  summary: string;
}

export interface AiDelta {
  id: string;
  text: string;
}

export interface AiUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface AiDone {
  id: string;
  provider: string;
  model: string;
  usage?: AiUsage;
  error?: string;
}

export type AiRisk = "low" | "medium" | "high";

export interface AiToolProposal {
  id: string;
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: AiRisk | string;
}

export interface AiToolResult {
  id: string;
  call_id: string;
  ok: boolean;
  message: string;
}

export interface TranscribeOptions {
  model?: string;
  language?: string;
  translate?: boolean;
  srt: boolean;
}

export interface TranscribeProgress {
  id: string;
  pct: number;
  stage: string;
}

export interface TranscribeDone {
  id: string;
  text?: string;
  srt_path?: string;
  error?: string;
}

export const AI_EVENTS = {
  delta: "lens://ai/delta",
  done: "lens://ai/done",
  toolProposal: "lens://ai/tool-proposal",
  toolResult: "lens://ai/tool-result",
  transcribeProgress: "lens://transcribe/progress",
  transcribeDone: "lens://transcribe/done",
} as const;

// ---------------------------------------------------------------- commands

export const aiStatus = () => invoke<AiStatus>("ai_status");
export const aiSetConfig = (config: Record<string, unknown>) => invoke<void>("ai_set_config", { config });
export const aiSetSecret = (provider: string, secret: string) => invoke<void>("ai_set_secret", { provider, secret });
export const aiClearSecret = (provider: string) => invoke<void>("ai_clear_secret", { provider });
export const aiAsk = (request: AiAskRequest) => invoke<string>("ai_ask", { request });
export const aiCancel = (id: string) => invoke<void>("ai_cancel", { id });
export const aiConfirmTool = (callId: string, approve: boolean) => invoke<void>("ai_confirm_tool", { callId, approve });
export const aiIntent = (text: string) => invoke<AiIntent | null>("ai_intent", { text });
export const transcribeFile = (path: string, options: TranscribeOptions) =>
  invoke<string>("transcribe_file", { path, options });

// ---------------------------------------------------------------- hook

export type AiRequestPhase = "idle" | "streaming" | "done" | "error" | "cancelled";

export interface AiToolCard extends AiToolProposal {
  /** undefined while waiting for the user; then the user's choice and, later, the result. */
  decision?: "approved" | "denied";
  result?: AiToolResult;
}

export interface AiRequestState {
  id: string | null;
  phase: AiRequestPhase;
  text: string;
  provider: string;
  model: string;
  usage?: AiUsage;
  error?: string;
  tools: AiToolCard[];
}

const EMPTY: AiRequestState = { id: null, phase: "idle", text: "", provider: "", model: "", tools: [] };

/**
 * One streaming request at a time. `ask()` starts it, events with a matching id update it, `cancel()`
 * stops it, `decide()` answers a tool proposal. Events for other ids are ignored, so several panels can
 * stream side by side.
 */
export function useAiRequest() {
  const [state, setState] = useState<AiRequestState>(EMPTY);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    const subs = [
      listen<AiDelta>(AI_EVENTS.delta, (e) => {
        if (e.payload.id !== idRef.current) return;
        setState((s) => ({ ...s, phase: "streaming", text: s.text + e.payload.text }));
      }),
      listen<AiDone>(AI_EVENTS.done, (e) => {
        if (e.payload.id !== idRef.current) return;
        const p = e.payload;
        setState((s) => ({
          ...s,
          phase: p.error ? (s.phase === "cancelled" ? "cancelled" : "error") : s.phase === "cancelled" ? "cancelled" : "done",
          provider: p.provider,
          model: p.model,
          usage: p.usage,
          error: p.error,
        }));
      }),
      listen<AiToolProposal>(AI_EVENTS.toolProposal, (e) => {
        if (e.payload.id !== idRef.current) return;
        setState((s) => ({ ...s, tools: [...s.tools.filter((t) => t.call_id !== e.payload.call_id), { ...e.payload }] }));
      }),
      listen<AiToolResult>(AI_EVENTS.toolResult, (e) => {
        if (e.payload.id !== idRef.current) return;
        setState((s) => ({
          ...s,
          tools: s.tools.map((t) => (t.call_id === e.payload.call_id ? { ...t, result: e.payload } : t)),
        }));
      }),
    ];
    return () => subs.forEach((p) => p.then((f) => f()));
  }, []);

  const ask = useCallback(async (request: AiAskRequest) => {
    idRef.current = null;
    setState({ ...EMPTY, phase: "streaming" });
    try {
      const id = await aiAsk(request);
      idRef.current = id;
      setState((s) => ({ ...s, id }));
      return id;
    } catch (e) {
      setState({ ...EMPTY, phase: "error", error: String(e) });
      return null;
    }
  }, []);

  const cancel = useCallback(async () => {
    const id = idRef.current;
    setState((s) => (s.phase === "streaming" ? { ...s, phase: "cancelled" } : s));
    if (id) await aiCancel(id).catch(() => {});
  }, []);

  const decide = useCallback(async (callId: string, approve: boolean) => {
    setState((s) => ({
      ...s,
      tools: s.tools.map((t) => (t.call_id === callId ? { ...t, decision: approve ? "approved" : "denied" } : t)),
    }));
    await aiConfirmTool(callId, approve).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    idRef.current = null;
    setState(EMPTY);
  }, []);

  return { state, ask, cancel, decide, reset };
}
