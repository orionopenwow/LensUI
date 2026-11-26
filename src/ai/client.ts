// Lens Intelligence client: typed wrappers for the ai_* commands, a streaming React hook, and
// the listener for UI-layer actions the backend asks for (`lens://ai/apply`).
//
//   const ai = useAiRequest();
//   await ai.ask({ prompt: "tidy my windows", context: {}, allow_tools: true });
//   ai.text / ai.steps / ai.status;  ai.confirm(callId, true);  ai.cancel();

import { confirmArgs, rememberStepToken } from "./stepTokens";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_EVENTS,
  INITIAL_RUN,
  reduceAiEvent,
  type AiApplyPayload,
  type AiConfig,
  type AiDeltaEvent,
  type AiDoneEvent,
  type AiEvent,
  type AiRequest,
  type AiRunState,
  type AiStatus,
  type AiToolProposalEvent,
  type AiToolResultEvent,
  type Intent,
} from "./contract";

export * from "./contract";

// --- commands --------------------------------------------------------------------------------

export const aiStatus = () => invoke<AiStatus>("ai_status");
export const aiSetConfig = (cfg: AiConfig) => invoke<void>("ai_set_config", { cfg });
/** The key goes straight to the DPAPI store; it is never returned. Clear the input afterwards. */
export const aiSetSecret = (provider: "claude" | "local", secret: string) => invoke<void>("ai_set_secret", { provider, secret });
export const aiClearSecret = (provider: "claude" | "local") => invoke<void>("ai_clear_secret", { provider });
/** Starts a request and resolves with its id; output arrives as lens://ai/* events. */
export const aiAsk = (req: AiRequest) => invoke<string>("ai_ask", { req });
export const aiCancel = (id: string) => invoke<boolean>("ai_cancel", { id });
/**
 * Answers a step that waits for you. An approval carries the step's one-time token (from the
 * proposal event); pass it, or let the one remembered for `callId` be used. Without the right
 * token Lens Core does not run the step.
 */
export const aiConfirmTool = (callId: string, approve: boolean, token?: string | null) =>
  invoke<void>("ai_confirm_tool", confirmArgs(callId, approve, token));
/** Instant, offline: what the built-in script assistant reads in a command (or null). */
export const aiIntent = (text: string) => invoke<Intent | null>("ai_intent", { text });
/**
 * Runs a parsed intent (from aiIntent) with no model: same tool registry and risk gating as
 * aiAsk; resolves with a request id and reports through the usual lens://ai/* events.
 */
export const aiRunIntent = (intent: Intent) => invoke<string>("ai_run_intent", { intent });
/** Metadata-only usage log (provider, model, tokens, which context fields were sent). */
export const aiUsageLog = (limit = 50) => invoke<Record<string, unknown>[]>("ai_usage_log", { limit });

// --- events ----------------------------------------------------------------------------------

/** Subscribes to all four request events; returns an unsubscribe function. */
export async function listenAiEvents(handler: (ev: AiEvent) => void): Promise<UnlistenFn> {
  const uns = await Promise.all([
    listen<AiDeltaEvent>(AI_EVENTS.delta, (e) => handler({ kind: "delta", payload: e.payload })),
    listen<AiDoneEvent>(AI_EVENTS.done, (e) => handler({ kind: "done", payload: e.payload })),
    listen<AiToolProposalEvent>(AI_EVENTS.toolProposal, (e) => {
      rememberStepToken(e.payload.call_id, e.payload.approval_token);
      handler({ kind: "tool-proposal", payload: e.payload });
    }),
    listen<AiToolResultEvent>(AI_EVENTS.toolResult, (e) => handler({ kind: "tool-result", payload: e.payload })),
  ]);
  return () => uns.forEach((u) => u());
}

/**
 * Handles UI-layer actions (colour mode, accent, focus mode, Lens settings pages, timers, show
 * desktop, "note saved"). Mount once in the shell — see docs/AI.md "Apply bridge".
 */
export function onAiApply(handler: (p: AiApplyPayload) => void): Promise<UnlistenFn> {
  return listen<AiApplyPayload>(AI_EVENTS.apply, (e) => {
    if (e.payload && typeof e.payload.tool === "string") handler(e.payload);
  });
}

// --- hook ------------------------------------------------------------------------------------

export interface UseAiRequest extends AiRunState {
  ask: (req: AiRequest) => Promise<string | null>;
  cancel: () => void;
  confirm: (callId: string, approve: boolean) => Promise<void>;
  reset: () => void;
}

/**
 * One streaming request at a time. Listeners are attached on mount; events that arrive before
 * `ai_ask` resolves are buffered and replayed once the request id is known.
 */
export function useAiRequest(): UseAiRequest {
  const [state, setState] = useState<AiRunState>(INITIAL_RUN);
  const idRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const bufferRef = useRef<AiEvent[]>([]);

  useEffect(() => {
    let alive = true;
    let un: UnlistenFn | null = null;
    listenAiEvents((ev) => {
      if (!alive) return;
      if (idRef.current === null) {
        if (pendingRef.current) bufferRef.current.push(ev);
        return;
      }
      if (ev.payload.id !== idRef.current) return;
      setState((s) => reduceAiEvent(s, ev));
    }).then((u) => {
      if (alive) un = u;
      else u();
    });
    return () => {
      alive = false;
      un?.();
    };
  }, []);

  const ask = useCallback(async (req: AiRequest) => {
    if (idRef.current) void aiCancel(idRef.current).catch(() => {});
    idRef.current = null;
    bufferRef.current = [];
    pendingRef.current = true;
    setState({ ...INITIAL_RUN, status: "running" });
    try {
      const id = await aiAsk(req);
      idRef.current = id;
      pendingRef.current = false;
      const early = bufferRef.current.filter((e) => e.payload.id === id);
      bufferRef.current = [];
      setState((s) => early.reduce(reduceAiEvent, { ...s, id }));
      return id;
    } catch (e) {
      pendingRef.current = false;
      setState({ ...INITIAL_RUN, status: "error", error: String(e) });
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (idRef.current) void aiCancel(idRef.current).catch(() => {});
  }, []);

  const confirm = useCallback(async (callId: string, approve: boolean) => {
    await aiConfirmTool(callId, approve);
  }, []);

  const reset = useCallback(() => {
    if (idRef.current) void aiCancel(idRef.current).catch(() => {});
    idRef.current = null;
    bufferRef.current = [];
    pendingRef.current = false;
    setState(INITIAL_RUN);
  }, []);

  return { ...state, ask, cancel, confirm, reset };
}
