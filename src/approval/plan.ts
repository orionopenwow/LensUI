// Plan view: several steps an agent proposed in one go, shown as one list with an Allow / Deny
// per step. Pure (no React, no Tauri) so it is unit-tested.
//
// Lens Core proposes the whole plan before any step runs (`ToolProposalEvent.plan`), and every
// step that waits has its own one-time token, so allowing one step can never run another.
import type { ApprovalRequest, SafetyReasonLike } from "./model";

/** A proposed step as the surfaces hold it (the proposal event plus the person's answer and the result). */
export interface PlanInput {
  call_id: string;
  tool: string;
  summary: string;
  /** "low" | "confirm" | "blocked" from Core, or the surfaces' "low" | "medium" | "high". */
  risk: string;
  plan?: { index: number; total: number } | null;
  safety?: SafetyReasonLike[];
  approval_token?: string;
  decision?: "approved" | "denied";
  result?: { ok: boolean; message: string } | null;
}

/** auto: runs without asking · waiting: needs your OK · allowed/denied: answered, not finished ·
 *  done/failed: finished · blocked: Lens stopped it, nothing to answer. */
export type StepState = "auto" | "waiting" | "allowed" | "denied" | "done" | "failed" | "blocked";

export interface PlanStep {
  id: string;
  index: number;
  tool: string;
  summary: string;
  state: StepState;
  /** The step needed (or needs) the person's OK. */
  needsOk: boolean;
  /** The result message, or why Lens stopped it. */
  note?: string;
  reasons: SafetyReasonLike[];
}

const needsOk = (risk: string) => risk === "confirm" || risk === "medium";
const isBlocked = (risk: string) => risk === "blocked" || risk === "high";

export function stepState(c: PlanInput): StepState {
  if (isBlocked(c.risk)) return "blocked";
  if (c.result) return c.result.ok ? "done" : c.decision === "denied" ? "denied" : "failed";
  if (c.decision === "denied") return "denied";
  if (c.decision === "approved") return "allowed";
  return needsOk(c.risk) ? "waiting" : "auto";
}

/**
 * The plan among a request's proposals: the newest group of steps Core marked as one plan
 * (same total, two or more). `null` when there is none, so single steps keep their own card.
 */
export function planSteps(cards: PlanInput[]): PlanStep[] | null {
  const marked = cards.filter((c) => c.plan && c.plan.total >= 2 && Number.isInteger(c.plan.index));
  if (marked.length < 2) return null;
  // Call ids end in "-r<round>-<n>": the newest round is the plan on screen.
  const round = (id: string) => /-r(\d+)-\d+$/.exec(id)?.[1] ?? "";
  const latest = round(marked[marked.length - 1].call_id);
  const group = marked.filter((c) => round(c.call_id) === latest);
  if (group.length < 2) return null;
  return group
    .slice()
    .sort((a, b) => a.plan!.index - b.plan!.index)
    .map((c) => ({
      id: c.call_id,
      index: c.plan!.index,
      tool: c.tool,
      summary: (c.summary || c.tool).trim().replace(/[.?!]*$/, ""),
      state: stepState(c),
      needsOk: needsOk(c.risk),
      note: c.result?.message || undefined,
      reasons: (c.safety ?? []).filter((r) => r && typeof r.detail === "string"),
    }));
}

/** Ids of the cards the plan view draws (so the surface doesn't draw them a second time). */
export function planIds(steps: PlanStep[] | null): Set<string> {
  return new Set((steps ?? []).map((s) => s.id));
}

export const waitingSteps = (steps: PlanStep[]): PlanStep[] => steps.filter((s) => s.state === "waiting");

export function planTitle(steps: PlanStep[]): string {
  const n = steps.length;
  const w = waitingSteps(steps).length;
  const asked = steps.filter((s) => s.needsOk).length;
  if (w > 0) return `${n} steps · ${w === 1 ? "1 needs your OK" : `${w} need your OK`}`;
  if (asked === 0) return `${n} steps · none needed your OK`;
  return `${n} steps`;
}

/** One short line per state, shown at the end of the row. */
export function stateLabel(s: PlanStep): string {
  switch (s.state) {
    case "auto":
      return "Runs without asking";
    case "waiting":
      return "Needs your OK";
    case "allowed":
      return "Allowed · running";
    case "denied":
      return "Denied · skipped";
    case "done":
      return "Done";
    case "failed":
      return "Didn't work";
    case "blocked":
      return "Stopped by Lens";
  }
}

/** A screen-reader sentence for the row. */
export function stepAria(s: PlanStep, total: number): string {
  return `Step ${s.index + 1} of ${total}: ${s.summary}. ${stateLabel(s)}.`;
}

// ---------------------------------------------------------------- the shared approval window

/** The assistant request and round a queue record's step belongs to ("<request>-r<round>"). */
export function planKey(reference: string | undefined): string | null {
  const m = /^(.*-r\d+)-\d+$/.exec(reference ?? "");
  return m ? m[1] : null;
}

/**
 * In the approval window: the waiting steps that belong to the same plan as `first`, in step
 * order. Only the assistant's own steps group; requests from AI apps, the bridge and Lens Apps
 * stay one card each. `null` unless two or more steps of the plan are waiting.
 */
export function planFromRequests(requests: ApprovalRequest[], first: ApprovalRequest | undefined): ApprovalRequest[] | null {
  if (!first || first.origin !== "ai") return null;
  const key = planKey(first.reference);
  if (!key) return null;
  const n = (r: ApprovalRequest) => Number(/-(\d+)$/.exec(r.reference ?? "")?.[1] ?? 0);
  const group = requests.filter((r) => r.origin === "ai" && planKey(r.reference) === key).sort((a, b) => n(a) - n(b));
  return group.length >= 2 ? group : null;
}

/** A waiting queue record as a plan row. */
export function stepFromRequest(r: ApprovalRequest, index: number, answered?: "approved" | "denied"): PlanStep {
  return {
    id: r.id,
    index,
    tool: "",
    summary: r.preview.question.trim().replace(/[.?!]*$/, ""),
    state: answered === "approved" ? "allowed" : answered === "denied" ? "denied" : "waiting",
    needsOk: true,
    reasons: r.preview.safetyReasons ?? [],
  };
}
