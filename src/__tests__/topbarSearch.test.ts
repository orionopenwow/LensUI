import { describe, expect, test } from "bun:test";
import { searchStep, isExpanded, type SearchPhase, type SearchEvent } from "../topbar/searchMachine";

const run = (events: SearchEvent[], from: SearchPhase = "closed") => {
  let p = from;
  const effects: string[] = [];
  for (const e of events) {
    const r = searchStep(p, e);
    p = r.phase;
    if (r.effect) effects.push(r.effect);
  }
  return { p, effects };
};

describe("Top Bar search state machine", () => {
  test("open then close sends one open and one close", () => {
    expect(run(["request-open", "opened", "request-close", "closed"])).toEqual({ p: "closed", effects: ["sync-open", "sync-close"] });
  });
  test("double click and focus while opening don't re-open", () => {
    expect(run(["request-open", "request-open", "opened", "request-open"])).toEqual({ p: "open", effects: ["sync-open"] });
  });
  test("watcher close animates out without echoing", () => {
    expect(run(["request-open", "opened", "backend-close", "closed"])).toEqual({ p: "closed", effects: ["sync-open"] });
  });
  test("close requests while closed or closing are ignored", () => {
    expect(run(["request-close", "request-close"])).toEqual({ p: "closed", effects: [] });
  });
  test("re-open during the close animation is allowed", () => {
    expect(run(["request-open", "opened", "request-close", "request-open"]).p).toBe("opening");
  });
  test("expanded only while opening or open", () => {
    expect(["closed", "opening", "open", "closing"].map((p) => isExpanded(p as SearchPhase))).toEqual([false, true, true, false]);
  });
});
