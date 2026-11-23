// Smoothness probe analysis and script (docs/SMOOTHNESS.md, R1).
import { describe, expect, test } from "bun:test";
import { analyze, frameInterval, framesBySurface, reportText, verdictOf, windowStats, type RawSession } from "../smooth/analyze";
import { SCRIPT_LABELS, SMOOTH_SCRIPT, scriptSeconds } from "../smooth/script";

const steady = (from: number, n: number, step = 16.7) => Array.from({ length: n }, (_, i) => from + i * step);

describe("frame maths", () => {
  test("frame interval is the median gap, ignoring pauses", () => {
    expect(frameInterval(steady(0, 120))).toBeCloseTo(16.7, 1);
    expect(frameInterval(steady(0, 120, 6.94))).toBeCloseTo(6.9, 1);
    expect(frameInterval([...steady(0, 60), ...steady(5000, 60)])).toBeCloseTo(16.7, 1);
    expect(frameInterval([])).toBe(16.7);
  });

  test("a steady run has no dropped frames", () => {
    const st = windowStats(steady(1000, 61), 16.7, 1000, 2100);
    expect(st.frames).toBe(61);
    expect(st.dropped).toBe(0);
    expect(st.worstMs).toBeCloseTo(16.7, 1);
  });

  test("a 50 ms stall counts as two dropped frames", () => {
    const f = [...steady(1000, 10), ...steady(1000 + 9 * 16.7 + 50.1, 10)];
    const st = windowStats(f, 16.7, 900, 2000);
    expect(st.dropped).toBe(2);
    expect(st.worstMs).toBeCloseTo(50.1, 1);
  });

  test("gaps over a show/hide or longer than half a second are pauses", () => {
    const f = [...steady(1000, 5), ...steady(1300, 5)];
    expect(windowStats(f, 16.7, 900, 2000, [1200]).dropped).toBe(0);
    expect(windowStats(f, 16.7, 900, 2000).dropped).toBeGreaterThan(10);
    expect(windowStats([0, 16.7, 900, 916.7], 16.7, 0, 1000).dropped).toBe(0);
  });

  test("page clocks are shifted onto the backend clock", () => {
    const m = framesBySurface([{ surface: "dock", offset: 100, frames: [2, 1], loaf: [], shifts: [] }, { nonsense: true }]);
    expect(m.get("dock")).toEqual([101, 102]);
  });
});

describe("verdicts", () => {
  const base = { frames: 60, droppedPct: 0, worstMs: 16.7, resizedMidAnimation: false };
  test("targets", () => {
    expect(verdictOf(base)).toBe("smooth");
    expect(verdictOf({ ...base, resizedMidAnimation: true })).toBe("rough");
    expect(verdictOf({ ...base, droppedPct: 3, worstMs: 45 })).toBe("rough");
    expect(verdictOf({ ...base, worstMs: 120 })).toBe("janky");
    expect(verdictOf({ ...base, droppedPct: 9 })).toBe("janky");
    expect(verdictOf({ ...base, frames: 1 })).toBe("no-data");
  });
});

describe("analyze", () => {
  const raw: RawSession = {
    session: "smooth-1-0",
    startedMs: 0,
    marks: [
      { id: "qs-open", phase: "begin", atMs: 10_000 },
      { id: "qs-open", phase: "end", atMs: 10_700 },
      { id: "dock-sweep", phase: "begin", atMs: 20_000 },
      { id: "dock-sweep", phase: "end", atMs: 21_000 },
      { id: "launcher", phase: "begin", atMs: 30_000 },
      { id: "launcher", phase: "end", atMs: 30_500 },
    ],
    native: [
      { atMs: 10_020, label: "quicksettings", kind: "show", x: 0, y: 0, w: 400, h: 600 },
      { atMs: 10_120, label: "quicksettings", kind: "resize", x: 0, y: 0, w: 400, h: 640 },
    ],
    chunks: [
      // Quick Settings: drew from the moment it was shown, with one 66.8 ms stall.
      { surface: "quicksettings", offset: 0, frames: [...steady(10_030, 10), ...steady(10_030 + 9 * 16.7 + 66.8, 20)], loaf: [{ at: 10_180, dur: 66, blocking: 16 }], shifts: [{ at: 10_200, value: 0.02 }] },
      // Dock: perfectly steady, page clock 250 ms behind the backend.
      { surface: "dock", offset: 250, frames: steady(19_700, 80), loaf: [], shifts: [] },
    ],
  };
  const r = analyze(raw, SCRIPT_LABELS);

  test("one row per interaction, in order", () => {
    expect(r.results.map((x) => x.id)).toEqual(["qs-open", "dock-sweep", "launcher"]);
    expect(r.results[0].label).toBe("Quick Settings opens");
  });

  test("flags the stall and the native resize", () => {
    const qs = r.results[0];
    expect(qs.surfaces).toEqual(["quicksettings"]);
    expect(qs.worstMs).toBeCloseTo(66.8, 1);
    expect(qs.droppedPct).toBeGreaterThan(5);
    expect(qs.resizedMidAnimation).toBe(true);
    expect(qs.nativeChanges).toEqual([{ label: "quicksettings", kind: "resize", atMs: 10_120 }]);
    expect(qs.longFrameMs).toBe(66);
    expect(qs.cls).toBe(0.02);
    expect(qs.verdict).toBe("janky");
  });

  test("a steady surface is smooth, a silent one is not measured", () => {
    expect(r.results[1].verdict).toBe("smooth");
    expect(r.results[1].droppedPct).toBe(0);
    expect(r.results[2].verdict).toBe("no-data");
    expect(r.summary).toMatchObject({ smooth: 1, janky: 1, noData: 1, resized: 1 });
  });

  test("text report names every interaction", () => {
    const t = reportText(r);
    expect(t).toContain("Quick Settings opens");
    expect(t).toContain("native resize:quicksettings");
  });
});

describe("script", () => {
  test("30 interactions with unique ids, done in about two minutes", () => {
    expect(SMOOTH_SCRIPT.length).toBe(30);
    expect(new Set(SMOOTH_SCRIPT.map((i) => i.id)).size).toBe(30);
    expect(scriptSeconds()).toBeGreaterThan(30);
    expect(scriptSeconds()).toBeLessThan(150);
  });
  test("only calls commands that exist", async () => {
    const gen = await Bun.file(new URL("../types/generated.ts", import.meta.url)).text();
    const cmds = new Set<string>();
    for (const i of SMOOTH_SCRIPT) for (const s of [...(i.setup ?? []), ...i.steps, ...(i.cleanup ?? [])]) if (s.do === "invoke") cmds.add(s.cmd);
    for (const c of cmds) expect({ c, known: gen.includes(`  ${c}: {`) }).toEqual({ c, known: true });
  });
});
