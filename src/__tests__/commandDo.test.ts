// Lens Command "Do" mode (src/command/doMode.ts): the offline intent engine runs first and needs
// no AI; only unknown text goes to the AI; every failure comes back as a message to show.
import { describe, expect, test } from "bun:test";
import { runDo, answersInText, type DoDeps } from "../command/doMode";
import type { Intent } from "../ai/contract";

const dark: Intent = { action: "set_color_mode", args: { mode: "dark" }, confidence: 0.97, summary: "Switch to dark mode" };

function deps(over: Partial<DoDeps> & { aiOff?: boolean } = {}) {
  const calls: string[] = [];
  const d: DoDeps = {
    intent: async (t) => (calls.push(`intent:${t}`), /dark mode/i.test(t) ? dark : null),
    runIntent: async (i) => (calls.push(`run:${i.action}`), "ai-1"),
    // Mirrors ai_ask with "Lens Intelligence" off.
    ask: async (t) => {
      calls.push(`ask:${t}`);
      if (over.aiOff) throw "Lens Intelligence is off. Turn it on in Lens settings › AI.";
      return "ai-2";
    },
    ...over,
  };
  return { d, calls };
}

describe("Command Do mode", () => {
  test('"dark mode" runs offline through ai_intent → ai_run_intent, even with AI off', async () => {
    const { d, calls } = deps({ aiOff: true });
    const out = await runDo("  dark mode ", d);
    expect(out).toEqual({ kind: "intent", intent: dark, reqId: "ai-1" });
    expect(calls).toEqual(["intent:dark mode", "run:set_color_mode"]);
  });

  test("an intent the preview already parsed is not parsed again", async () => {
    const { d, calls } = deps();
    await runDo("dark mode", d, dark);
    expect(calls).toEqual(["run:set_color_mode"]);
  });

  test("unknown text goes to the AI with tools", async () => {
    const { d, calls } = deps();
    expect(await runDo("tidy my desktop", d)).toEqual({ kind: "ai", reqId: "ai-2" });
    expect(calls).toEqual(["intent:tidy my desktop", "ask:tidy my desktop"]);
  });

  test("unknown text with AI off returns the reason instead of failing silently", async () => {
    const { d } = deps({ aiOff: true });
    const out = await runDo("tidy my desktop", d);
    expect(out.kind).toBe("error");
    if (out.kind === "error") expect(out.message).toContain("Lens Intelligence is off");
  });

  test("a failing ai_run_intent (actions turned off) is reported with the intent", async () => {
    const { d } = deps({ runIntent: async () => { throw new Error("AI actions are turned off in Lens settings › AI."); } });
    const out = await runDo("dark mode", d);
    expect(out).toEqual({ kind: "error", message: "AI actions are turned off in Lens settings › AI.", intent: dark });
  });

  test("a failing ai_intent falls through to the AI; empty text does nothing", async () => {
    const { d, calls } = deps({ intent: async () => { throw new Error("ipc"); } });
    expect((await runDo("dark mode", d)).kind).toBe("ai");
    expect(await runDo("   ", d)).toEqual({ kind: "none" });
    expect(calls.filter((c) => c.startsWith("ask"))).toHaveLength(1);
  });

  test("only calculations and conversions need an answer card", () => {
    expect(answersInText(dark)).toBe(false);
    expect(answersInText({ ...dark, action: "calculate" })).toBe(true);
    expect(answersInText({ ...dark, action: "convert" })).toBe(true);
  });
});
