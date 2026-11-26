/**
 * The AI surfaces' view of Lens Intelligence (src/ai/AskPanel, the Dock's Ask mode, drop-to-AI,
 * the AI card). It uses the real ai-core client (src/ai/client.ts, src/ai/contract.ts) and adds
 * the few things the surfaces need on top:
 *   - `useAiRequest`, a single-request hook with tool cards (risk shown as low/medium/high);
 *   - `aiSetConfig` for the AI card's compact settings payload, mapped onto `AiConfig`;
 *   - `transcribeFile` and its events (W6-C).
 * It replaced the temporary contract.shim.ts when ai-core landed.
 */
import { rememberStepToken } from "./stepTokens";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  aiAsk,
  aiCancel,
  aiConfirmTool,
  aiSetConfig as setAiConfig,
} from "./client";
import {
  CONSENT_TOOL,
  DEFAULT_AI_CONFIG,
  type AiConfig,
  type AiDeltaEvent,
  type AiDoneEvent,
  type AiRequest,
  type AiToolProposalEvent,
  type AiToolResultEvent,
  type Intent,
  type PrivacyMode,
  type ProviderInfo,
  type Risk,
  type Usage,
} from "./contract";

export { aiAsk, aiCancel, aiConfirmTool, aiIntent, aiRunIntent, aiStatus, aiSetSecret, aiClearSecret } from "./client";
export type { AiContext, AiStatus } from "./contract";

// ---------------------------------------------------------------- types

export type AiProviderKind = ProviderInfo["kind"];
export type AiPrivacy = PrivacyMode;
export type AiProviderInfo = ProviderInfo;
export type AiAskRequest = AiRequest;
export type AiIntent = Intent;
export type AiDelta = AiDeltaEvent;
export type AiUsage = Partial<Usage>;
export type AiDone = AiDoneEvent;
export type AiToolResult = AiToolResultEvent;

/** How a tool card is shown: the backend's low / confirm / blocked as low / medium / high impact. */
export type AiRisk = "low" | "medium" | "high";
export function surfaceRisk(risk: Risk | string): AiRisk {
  return risk === "blocked" || risk === "high" ? "high" : risk === "confirm" || risk === "medium" ? "medium" : "low";
}

export interface AiToolProposal extends Omit<AiToolProposalEvent, "risk"> {
  risk: AiRisk | string;
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

export const transcribeFile = (path: string, options: TranscribeOptions) =>
  invoke<string>("transcribe_file", { path, options });

/** The AI card's compact settings: which provider answers, privacy, what AI may do, models. */
export interface AiCardSettings {
  active?: string;
  privacy?: AiPrivacy;
  tools?: Record<string, boolean>;
  models?: Record<string, string>;
}

/** Maps the AI card's settings onto the stored `AiConfig`, keeping every other field. */
export function cardSettingsToConfig(current: AiConfig, s: AiCardSettings): AiConfig {
  const active = s.active ?? (current.enabled ? current.provider : "off");
  const enabled = active !== "off";
  const provider = (["script", "local", "claude"].includes(active) ? active : current.provider) as AiConfig["provider"];
  const tools = s.tools ?? {};
  return {
    ...current,
    enabled,
    provider,
    privacy: s.privacy ?? current.privacy,
    allow_tools: Object.keys(tools).length ? Object.values(tools).some(Boolean) : current.allow_tools,
    claude_model: s.models?.claude || current.claude_model,
    local_model: s.models?.local ?? current.local_model,
  };
}

export async function aiSetConfig(settings: AiCardSettings | Record<string, unknown>): Promise<void> {
  const cfg = await invoke<{ ai?: Partial<AiConfig> }>("get_config").catch(() => null);
  const current: AiConfig = { ...DEFAULT_AI_CONFIG, ...(cfg?.ai ?? {}) };
  await setAiConfig(cardSettingsToConfig(current, settings as AiCardSettings));
}

/** Shown on a step whose Allow / Deny never reached Lens Core. */
export const ANSWER_LOST = "Lens didn't get your answer in time, so this step didn't run. Ask again if you still want it.";

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
      listen<AiDeltaEvent>(AI_EVENTS.delta, (e) => {
        if (e.payload.id !== idRef.current) return;
        setState((s) => ({ ...s, phase: "streaming", text: s.text + e.payload.text }));
      }),
      listen<AiDoneEvent>(AI_EVENTS.done, (e) => {
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
      listen<AiToolProposalEvent>(AI_EVENTS.toolProposal, (e) => {
        if (e.payload.id !== idRef.current) return;
        rememberStepToken(e.payload.call_id, e.payload.approval_token);
        // The Ask panel shows its own consent card before any cloud send, so the backend's
        // ask-each-time consent for that same request is answered here instead of twice.
        if (e.payload.tool === CONSENT_TOOL) {
          aiConfirmTool(e.payload.call_id, true, e.payload.approval_token).catch(() => {});
          return;
        }
        const card: AiToolProposal = { ...e.payload, risk: surfaceRisk(e.payload.risk) };
        setState((s) => ({ ...s, tools: [...s.tools.filter((t) => t.call_id !== card.call_id), card] }));
      }),
      listen<AiToolResultEvent>(AI_EVENTS.toolResult, (e) => {
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
    try {
      await aiConfirmTool(callId, approve);
    } catch {
      // The answer didn't reach Lens Core (the step timed out or the request ended). Say so on
      // the card instead of leaving it on "Approved · running…" for good.
      setState((s) => ({
        ...s,
        tools: s.tools.map((t) =>
          t.call_id === callId && !t.result ? { ...t, result: { id: s.id ?? "", call_id: callId, ok: false, message: ANSWER_LOST } } : t
        ),
      }));
    }
  }, []);

  const reset = useCallback(() => {
    idRef.current = null;
    setState(EMPTY);
  }, []);

  return { state, ask, cancel, decide, reset };
}
