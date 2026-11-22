// Local shim for the Lens AI client (feature/ai-core: src/ai/client.ts + src/ai/contract.ts).
// Names and shapes mirror that contract so the integrator can swap this import for the real one.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ProviderKind = "off" | "script" | "local" | "claude";
export type PrivacyMode = "local_only" | "ask_each_time" | "allow_cloud";

export interface ProviderInfo {
  id: string;
  kind: ProviderKind;
  label: string;
  available: boolean;
  model?: string | null;
  is_local: boolean;
  needs_key: boolean;
  has_key: boolean;
}

export interface AiStatus {
  providers: ProviderInfo[];
  active: string;
  privacy: PrivacyMode;
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

export interface AiRequest {
  prompt: string;
  context: AiContext;
  provider?: string;
  allow_tools: boolean;
}

export interface Intent {
  action: string;
  args: Record<string, unknown>;
  confidence: number;
  summary: string;
}

export interface AiDelta { id: string; text: string }
export interface AiDone {
  id: string;
  provider: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number } | null;
  error?: string | null;
}
export interface ToolProposal {
  id: string;
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: "low" | "confirm" | "blocked";
}
export interface ToolResult { id: string; call_id: string; ok: boolean; message: string }

export const EVT_AI_DELTA = "lens://ai/delta";
export const EVT_AI_DONE = "lens://ai/done";
export const EVT_AI_TOOL_PROPOSAL = "lens://ai/tool-proposal";
export const EVT_AI_TOOL_RESULT = "lens://ai/tool-result";

export const aiStatus = () => invoke<AiStatus>("ai_status");
export const aiAsk = (req: AiRequest) => invoke<string>("ai_ask", { req });
export const aiIntent = (text: string) => invoke<Intent | null>("ai_intent", { text });
export const aiCancel = (id: string) => invoke<void>("ai_cancel", { id });
export const aiConfirmTool = (callId: string, approve: boolean) =>
  invoke<void>("ai_confirm_tool", { callId, approve });

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
      listen<ToolProposal>(EVT_AI_TOOL_PROPOSAL, (e) => ref.current.onToolProposal?.(e.payload)),
      listen<ToolResult>(EVT_AI_TOOL_RESULT, (e) => ref.current.onToolResult?.(e.payload)),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(() => {}));
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
