// Agent-mode glue: turns plan steps into gated page actions and keeps the timeline model.
import type { Decision, ElementDescription, PageAction, Target } from "./api";
import type { PlanStep } from "./guard";

export type AgentItem =
  | { kind: "user"; key: string; text: string; at: number }
  | { kind: "say"; key: string; text: string; at: number }
  | { kind: "action"; key: string; text: string; ok: boolean; at: number }
  | { kind: "blocked"; key: string; text: string; reason: string; at: number }
  | { kind: "flag"; key: string; excerpts: string[]; at: number }
  | { kind: "answer"; key: string; text: string; provider?: string; at: number };

export interface PendingOk {
  step: PlanStep;
  element: number;
  decision: Decision;
  desc: ElementDescription;
  capturedAt: number;
}

export function stepToAction(step: PlanStep): { action: PageAction; element?: number } {
  const blank: Partial<Target> = {};
  switch (step.do) {
    case "read_page":
      return { action: { do: "read_page" } };
    case "scroll":
      return { action: { do: "scroll", dy: step.dy ?? 600 }, element: step.ref };
    case "click":
      return { action: { do: "click", target: blank }, element: step.ref };
    case "submit":
      return { action: { do: "submit", target: blank }, element: step.ref };
    case "type":
      return { action: { do: "type", target: blank, text: step.text }, element: step.ref };
    case "select":
      return { action: { do: "select", target: blank, value: step.value }, element: step.ref };
    case "navigate":
      return { action: { do: "navigate", url: step.url } };
    case "search":
      return { action: { do: "search", query: step.query } };
  }
}

/** Card headline from what's about to happen, e.g. "Complete reservation on opentable.com?" */
export function approvalTitle(d: ElementDescription, decision: Decision): string {
  const what = (d.target.text || d.target.label || "this button").replace(/\s+/g, " ").trim().slice(0, 60);
  const host = d.host.replace(/^www\./, "");
  switch (decision.category) {
    case "booking":
      return `${what} on ${host}?`;
    case "send":
      return `Send this on ${host}?`;
    case "delete":
      return `${what}? This can't be undone on ${host}.`;
    default:
      return `${what} on ${host}?`;
  }
}

/** Notes that mention money or irreversibility are surfaced as warnings on the card. */
export function warnings(d: Pick<ElementDescription, "notes" | "context">): string[] {
  const all = [...d.notes, ...(d.context ? [d.context] : [])];
  const out: string[] = [];
  for (const n of all) {
    if (/(\$|€|£)\s?\d|\bfee\b|no[- ]show|non[- ]refundable|cannot be undone|charged/i.test(n) && !out.includes(n)) out.push(n.length > 140 ? `${n.slice(0, 137)}…` : n);
    if (out.length >= 3) break;
  }
  return out;
}

/** Hold-to-confirm progress (0–1) for a press that started at `downAt`. */
export function holdProgress(downAt: number | null, now: number, holdMs = 900): number {
  if (downAt === null) return 0;
  return Math.max(0, Math.min(1, (now - downAt) / holdMs));
}
