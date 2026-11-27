// Lens Command's view of Lens Intelligence: the real ai-core client (src/ai/client.ts,
// src/ai/contract.ts) plus an all-requests event hook for the Command thread.
// (This replaced the local aiShim.ts once feature/ai-core landed.)
import { rememberStepToken } from "../ai/stepTokens";
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { aiAsk, aiCancel } from "../ai/client";
import { quiet } from "../failsafe/calls";
import type {
  AiDoneEvent,
  AiDeltaEvent,
  AiRequest,
  AiToolProposalEvent,
  AiToolResultEvent,
} from "../ai/contract";

export { aiAsk, aiCancel, aiConfirmTool, aiIntent, aiRunIntent, aiStatus } from "../ai/client";
export type { AiContext, AiRequest, AiStatus, Intent, PrivacyMode, ProviderInfo, ProviderKind } from "../ai/contract";

export type AiDelta = AiDeltaEvent;
export type AiDone = AiDoneEvent;
export type ToolProposal = AiToolProposalEvent;
export type ToolResult = AiToolResultEvent;

export const EVT_AI_DELTA = "lens://ai/delta";
export const EVT_AI_DONE = "lens://ai/done";
export const EVT_AI_TOOL_PROPOSAL = "lens://ai/tool-proposal";
export const EVT_AI_TOOL_RESULT = "lens://ai/tool-result";

export interface AiStreamHandlers {
  onDelta?: (d: AiDelta) => void;
  onDone?: (d: AiDone) => void;
  onToolProposal?: (p: ToolProposal) => void;
  onToolResult?: (r: ToolResult) => void;
}

/** Subscribes to every AI event once; handlers receive events for all request ids. */
export function useAiEvents(handlers: AiStreamHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const subs = [
      listen<AiDelta>(EVT_AI_DELTA, (e) => ref.current.onDelta?.(e.payload)),
      listen<AiDone>(EVT_AI_DONE, (e) => ref.current.onDone?.(e.payload)),
      listen<ToolProposal>(EVT_AI_TOOL_PROPOSAL, (e) => {
        // Keep the step's one-time approval token for the answer (src/ai/stepTokens.ts).
        rememberStepToken(e.payload.call_id, (e.payload as { approval_token?: string }).approval_token);
        ref.current.onToolProposal?.(e.payload);
      }),
      listen<ToolResult>(EVT_AI_TOOL_RESULT, (e) => ref.current.onToolResult?.(e.payload)),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(quiet));
    };
  }, []);
}

/** Single-request streaming hook, shaped like ai-core's `useAiRequest`. */
export function useAiRequest() {
  const [id, setId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [done, setDone] = useState<AiDone | null>(null);
  const idRef = useRef<string | null>(null);
  useAiEvents({
    onDelta: (d) => d.id === idRef.current && setText((t) => t + d.text),
    onDone: (d) => d.id === idRef.current && setDone(d),
  });
  const ask = useCallback(async (req: AiRequest) => {
    setText("");
    setDone(null);
    const rid = await aiAsk(req);
    idRef.current = rid;
    setId(rid);
    return rid;
  }, []);
  const cancel = useCallback(() => idRef.current && aiCancel(idRef.current), []);
  return { id, text, done, ask, cancel, streaming: !!id && !done };
}
