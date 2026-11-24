// The unified message thread: everything that happens in Lens Command is one card in one timeline.
import type { AiDone, ToolProposal, ToolResult } from "./ai";
import type { Destination } from "./parse";

export interface ContextChip {
  key: string;
  source: "selection" | "clipboard" | "window" | "shelf" | "page" | "file" | "clip";
  label: string;
  /** Short description shown under the label (size, app, URL). */
  detail: string;
  chars: number;
  tokens: number;
  localOnly: boolean;
  /** The value sent; never shown in full in the strip. */
  value?: string;
  url?: string;
  ids?: string[];
}

export interface BridgeRequest {
  id: string;
  action: string;
  selection?: string;
  url?: string;
  title?: string;
  page_text?: string;
}

export type ThreadItem =
  | { kind: "user"; key: string; text: string; command?: string; chips: ContextChip[]; dest: Destination; ts: number }
  | {
      kind: "answer";
      key: string;
      reqId: string | null;
      text: string;
      status: "streaming" | "done" | "error" | "cancelled";
      provider?: string;
      model?: string;
      error?: string;
      tokens?: { in: number; out: number };
      ts: number;
    }
  | {
      kind: "tool";
      key: string;
      proposal: ToolProposal;
      state: "pending" | "approved" | "denied" | "done" | "failed";
      message?: string;
      ts: number;
    }
  | { kind: "action"; key: string; title: string; detail?: string; ok: boolean; ts: number }
  | { kind: "consent"; key: string; reqKey: string; dest: Destination; fields: string[]; state: "pending" | "allowed" | "declined"; ts: number }
  | { kind: "bridge"; key: string; request: BridgeRequest; state: "new" | "handled" | "dismissed"; ts: number };

export type ThreadAction =
  | { type: "push"; item: ThreadItem }
  | { type: "attachReq"; key: string; reqId: string }
  | { type: "delta"; reqId: string; text: string }
  | { type: "done"; done: AiDone }
  | { type: "cancel"; key: string }
  | { type: "proposal"; proposal: ToolProposal; ts: number }
  | { type: "toolDecision"; callId: string; approve: boolean }
  | { type: "toolResult"; result: ToolResult }
  | { type: "consent"; key: string; state: "allowed" | "declined" }
  | { type: "bridgeState"; key: string; state: "handled" | "dismissed" }
  | { type: "remove"; key: string }
  | { type: "clear" };

export const MAX_THREAD = 200;

export function threadReducer(state: ThreadItem[], a: ThreadAction): ThreadItem[] {
  switch (a.type) {
    case "push": {
      const next = [...state, a.item];
      return next.length > MAX_THREAD ? next.slice(next.length - MAX_THREAD) : next;
    }
    case "attachReq":
      return state.map((i) => (i.kind === "answer" && i.key === a.key ? { ...i, reqId: a.reqId } : i));
    case "delta":
      return state.map((i) =>
        i.kind === "answer" && i.reqId === a.reqId && i.status === "streaming" ? { ...i, text: i.text + a.text } : i
      );
    case "done":
      return state.map((i) =>
        i.kind === "answer" && i.reqId === a.done.id && i.status === "streaming"
          ? {
              ...i,
              status: a.done.error ? "error" : "done",
              error: a.done.error ?? undefined,
              provider: a.done.provider,
              model: a.done.model,
              tokens: a.done.usage ? { in: a.done.usage.input_tokens, out: a.done.usage.output_tokens } : undefined,
            }
          : i
      );
    case "cancel":
      return state.map((i) => (i.kind === "answer" && i.key === a.key && i.status === "streaming" ? { ...i, status: "cancelled" } : i));
    case "proposal":
      if (state.some((i) => i.kind === "tool" && i.proposal.call_id === a.proposal.call_id)) return state;
      return threadReducer(state, {
        type: "push",
        item: {
          kind: "tool",
          key: `tool-${a.proposal.call_id}`,
          proposal: a.proposal,
          state: a.proposal.risk === "blocked" ? "denied" : "pending",
          message: a.proposal.risk === "blocked" ? (a.proposal.safety?.length ? "Lens stopped this step." : "Lens never runs this kind of action.") : undefined,
          ts: a.ts,
        },
      });
    case "toolDecision":
      return state.map((i) =>
        i.kind === "tool" && i.proposal.call_id === a.callId && i.state === "pending"
          ? { ...i, state: a.approve ? "approved" : "denied" }
          : i
      );
    case "toolResult":
      return state.map((i) =>
        i.kind === "tool" && i.proposal.call_id === a.result.call_id
          ? { ...i, state: a.result.ok ? "done" : "failed", message: a.result.message }
          : i
      );
    case "consent":
      return state.map((i) => (i.kind === "consent" && i.key === a.key ? { ...i, state: a.state } : i));
    case "bridgeState":
      return state.map((i) => (i.kind === "bridge" && i.key === a.key ? { ...i, state: a.state } : i));
    case "remove":
      return state.filter((i) => i.key !== a.key);
    case "clear":
      return [];
  }
}

let seq = 0;
export const newKey = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Bridge actions from the browser extension → the slash command they run. */
export function bridgeCommand(action: string): string {
  switch (action) {
    case "summarise":
    case "summarize":
    case "summarise_page":
      return "summarise";
    case "ask":
    case "ask_page":
      return "ask-page";
    case "transcribe":
      return "transcribe";
    case "save":
    case "save_note":
      return "note";
    case "explain":
      return "explain";
    case "translate":
      return "translate";
    default:
      return "ask-page";
  }
}
