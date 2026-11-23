// Lens Intelligence contract: the streaming reducer and helpers in src/ai/contract.ts.
import { describe, expect, test } from "bun:test";
import {
  AI_EVENTS,
  AI_TOOLS,
  DEFAULT_AI_CONFIG,
  INITIAL_RUN,
  attachedFields,
  isFinished,
  pendingApprovals,
  reduceAiEvent,
  whereItRuns,
  type AiEvent,
  type AiRunState,
} from "../ai/contract";

const run = (events: AiEvent[], start: AiRunState = { ...INITIAL_RUN, id: "r1", status: "running" }) =>
  events.reduce(reduceAiEvent, start);

describe("reduceAiEvent", () => {
  test("streams text and finishes", () => {
    const s = run([
      { kind: "delta", payload: { id: "r1", text: "Hello " } },
      { kind: "delta", payload: { id: "r1", text: "there" } },
      { kind: "done", payload: { id: "r1", provider: "script", model: "lens-script-1", usage: { input_tokens: 3, output_tokens: 2 } } },
    ]);
    expect(s.text).toBe("Hello there");
    expect(s.status).toBe("done");
    expect(s.usage?.output_tokens).toBe(2);
    expect(isFinished(s)).toBe(true);
  });

  test("ignores other requests", () => {
    const s = run([{ kind: "delta", payload: { id: "other", text: "nope" } }]);
    expect(s.text).toBe("");
  });

  test("tool steps: low runs, confirm waits, results settle", () => {
    let s = run([
      { kind: "tool-proposal", payload: { id: "r1", call_id: "c1", tool: "set_volume", args: { level: 30 }, summary: "Set volume to 30%", risk: "low" } },
      { kind: "tool-result", payload: { id: "r1", call_id: "c1", ok: true, message: "Volume set to 30%." } },
      { kind: "tool-proposal", payload: { id: "r1", call_id: "c2", tool: "close_app", args: { name: "word" }, summary: "Close word", risk: "confirm" } },
    ]);
    expect(s.status).toBe("waiting");
    expect(pendingApprovals(s).map((x) => x.call_id)).toEqual(["c2"]);
    expect(s.steps[0].state).toBe("ok");
    s = reduceAiEvent(s, { kind: "tool-result", payload: { id: "r1", call_id: "c2", ok: false, message: "The user declined this action." } });
    expect(s.status).toBe("running");
    expect(s.steps[1].state).toBe("failed");
    expect(pendingApprovals(s)).toEqual([]);
  });

  test("errors and cancellation", () => {
    const err = run([{ kind: "done", payload: { id: "r1", provider: "claude", model: "m", error: "Nothing was sent to Claude (Anthropic)." } }]);
    expect(err.status).toBe("error");
    const cancelled = run([
      { kind: "tool-proposal", payload: { id: "r1", call_id: "c", tool: "create_note", args: {}, summary: "x", risk: "confirm" } },
      { kind: "done", payload: { id: "r1", provider: "script", model: "m", error: "Cancelled." } },
    ]);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.steps[0].state).toBe("failed");
  });
});

describe("helpers", () => {
  test("defaults are private and off", () => {
    expect(DEFAULT_AI_CONFIG.enabled).toBe(false);
    expect(DEFAULT_AI_CONFIG.privacy).toBe("local_only");
    expect(DEFAULT_AI_CONFIG.provider).toBe("script");
    expect(Object.keys(DEFAULT_AI_CONFIG).some((k) => /key|secret|password/.test(k))).toBe(false);
  });

  test("attached fields follow the backend order and skip blanks", () => {
    expect(attachedFields({ page_text: "x", selection: "y", clipboard: "  ", files: [], url: "u" })).toEqual(["url", "selection", "page_text"]);
    expect(attachedFields({})).toEqual([]);
    expect(attachedFields({ shelf_text: "clips", url: "u" })).toEqual(["url", "shelf_text"]);
  });

  test("badges and tool risks", () => {
    expect(whereItRuns({ kind: "local", is_local: true })).toBe("On this PC");
    expect(whereItRuns({ kind: "claude", is_local: false })).toBe("Cloud");
    expect(whereItRuns({ kind: "off", is_local: true })).toBe("Off");
    expect(AI_TOOLS.close_app).toBe("confirm");
    expect(AI_TOOLS.create_note).toBe("confirm");
    expect(Object.values(AI_TOOLS).includes("blocked")).toBe(false);
    expect(AI_EVENTS.done).toBe("lens://ai/done");
  });
});
