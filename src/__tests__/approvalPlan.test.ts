// Plan view: the pure model behind src/approval/PlanCard.tsx.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planFromRequests, planIds, planKey, planSteps, planTitle, stateLabel, stepAria, stepFromRequest, stepState, waitingSteps, type PlanInput } from "../approval/plan";
import { requestForProposal } from "../approval/model";

const step = (n: number, o: Partial<PlanInput> = {}): PlanInput => ({
  call_id: `ai-7-r0-${n}`,
  tool: ["set_volume", "close_app", "lock_screen"][n] ?? "tool",
  summary: ["Set volume to 20%.", "Close Notepad", "Lock the PC"][n] ?? "Do it",
  risk: n === 0 ? "low" : "confirm",
  plan: { index: n, total: 3 },
  ...o,
});

describe("plan view", () => {
  test("several steps proposed at once become one ordered plan", () => {
    const steps = planSteps([step(2), step(0), step(1)])!;
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(steps.map((s) => s.state)).toEqual(["auto", "waiting", "waiting"]);
    expect(steps[0].summary).toBe("Set volume to 20%");
    expect(planTitle(steps)).toBe("3 steps · 2 need your OK");
    expect(waitingSteps(steps).map((s) => s.id)).toEqual(["ai-7-r0-1", "ai-7-r0-2"]);
    expect([...planIds(steps)]).toEqual(["ai-7-r0-0", "ai-7-r0-1", "ai-7-r0-2"]);
  });

  test("a single step, or steps without plan marks, are not a plan", () => {
    expect(planSteps([])).toBeNull();
    expect(planSteps([step(1, { plan: undefined })])).toBeNull();
    expect(planSteps([step(0, { plan: undefined }), step(1, { plan: undefined })])).toBeNull();
    expect(planSteps([step(0, { plan: { index: 0, total: 1 } })])).toBeNull();
    expect(planIds(null).size).toBe(0);
  });

  test("each step has its own state: allow one, deny one, one blocked", () => {
    const cards = [
      step(0, { result: { ok: true, message: "Volume 20%" } }),
      step(1, { decision: "approved" }),
      step(2, { decision: "denied", result: { ok: false, message: "The user declined this action." } }),
    ];
    const steps = planSteps(cards)!;
    expect(steps.map((s) => s.state)).toEqual(["done", "allowed", "denied"]);
    expect(planTitle(steps)).toBe("3 steps");
    expect(waitingSteps(steps)).toEqual([]);
    expect(stepState(step(1, { risk: "blocked" }))).toBe("blocked");
    expect(stepState(step(1, { risk: "high" }))).toBe("blocked");
    expect(stepState(step(1, { risk: "medium" }))).toBe("waiting");
    expect(stepState(step(1, { decision: "approved", result: { ok: false, message: "No such app" } }))).toBe("failed");
    expect(planTitle(planSteps([step(0), step(0, { call_id: "ai-7-r0-1", plan: { index: 1, total: 2 } })])!)).toBe("2 steps · none needed your OK");
    expect(planTitle(planSteps([step(0), step(1)])!)).toBe("2 steps · 1 needs your OK");
  });

  test("a later round's plan replaces the earlier one on screen", () => {
    const old = [step(0), step(1)];
    const next = [
      step(0, { call_id: "ai-7-r1-0", summary: "Open Spotify", plan: { index: 0, total: 2 } }),
      step(1, { call_id: "ai-7-r1-1", summary: "Close Word", plan: { index: 1, total: 2 } }),
    ];
    expect(planSteps([...old, ...next])!.map((s) => s.id)).toEqual(["ai-7-r1-0", "ai-7-r1-1"]);
  });

  test("labels say what happens in plain words, and rows are named for screen readers", () => {
    const steps = planSteps([step(0), step(1), step(2, { risk: "blocked", result: { ok: false, message: "x" } })])!;
    expect(steps.map(stateLabel)).toEqual(["Runs without asking", "Needs your OK", "Stopped by Lens"]);
    expect(stepAria(steps[1], 3)).toBe("Step 2 of 3: Close Notepad. Needs your OK.");
  });

  test("the approval window groups only the assistant's own waiting steps of one plan", () => {
    const req = (ref: string, origin: "ai" | "mcp" = "ai") => ({ ...requestForProposal({ call_id: ref, tool: "close_app", summary: `Do ${ref}`, risk: "confirm", approval_token: `tok-${ref}` }), id: `q-${ref}`, origin });
    const [a, b, c] = [req("ai-7-r0-1"), req("ai-7-r0-2"), req("ai-9-r0-0")];
    expect(planKey("ai-7-r0-2")).toBe("ai-7-r0");
    expect(planKey("bridge-1")).toBeNull();
    expect(planKey(undefined)).toBeNull();
    expect(planFromRequests([b, c, a], a)!.map((r) => r.id)).toEqual(["q-ai-7-r0-1", "q-ai-7-r0-2"]);
    // One waiting step, another request's step, or an AI app's request: the single card.
    expect(planFromRequests([a, c], a)).toBeNull();
    expect(planFromRequests([a, b], undefined)).toBeNull();
    const outside = { ...b, origin: "mcp" as const };
    expect(planFromRequests([a, outside], a)).toBeNull();
    // Every row keeps its own request, and so its own token.
    const rows = planFromRequests([a, b], a)!;
    expect(rows.map((r) => r.token)).toEqual(["tok-ai-7-r0-1", "tok-ai-7-r0-2"]);
    expect(stepFromRequest(rows[0], 0)).toMatchObject({ id: "q-ai-7-r0-1", state: "waiting", summary: "Do ai-7-r0-1", needsOk: true });
    expect(stepFromRequest(rows[0], 0, "approved").state).toBe("allowed");
    expect(stepFromRequest(rows[0], 0, "denied").state).toBe("denied");
  });

  test("the card answers one step at a time and never focuses Allow all", () => {
    const card = readFileSync(join(import.meta.dir, "..", "approval", "PlanCard.tsx"), "utf8");
    expect(card).toContain("onDecide(s.id, true)");
    expect(card).toContain("onDecide(s.id, false)");
    expect(card).toContain("[data-first-allow]");
    // Per-step buttons are named with the step, so two "Allow" buttons are never ambiguous.
    expect(card).toContain("aria-label={`Allow step ${s.index + 1}: ${s.summary}`}");
    expect(card).not.toContain("title=");
  });
});
