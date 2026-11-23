import { describe, expect, test } from "bun:test";
import {
  areaOf,
  groupCommits,
  issueBody,
  issueTitle,
  parseLatest,
  parseResults,
  plainTitle,
  progressOf,
  reportMarkdown,
  setStep,
  visibleSteps,
  type LatestStep,
} from "../tester/model";
import example from "../../docs/tester/LATEST.example.json";

const steps: LatestStep[] = [
  { id: "a", area: "Dock", steps: "do a", expected: "ok", risk: "low" },
  { id: "b", area: "Themes", steps: "do b", expected: "ok", risk: "high" },
  { id: "c", area: "Windows", steps: "do c", expected: "ok", risk: "med" },
  { id: "d", area: "Dock", steps: "do d", expected: "ok", risk: "high" },
];

describe("changelog grouping", () => {
  test("infers areas from paths before words", () => {
    expect(areaOf({ subject: "tweak", files: ["src/surfaces/DockSurface.tsx", "src/dock/styles.ts"] })).toBe("Dock");
    expect(areaOf({ subject: "fix theme", files: ["src-tauri/src/win_dwm_engine.rs"] })).toBe("Windows");
    expect(areaOf({ subject: "Add Ollama detection", files: [] })).toBe("AI & Command");
    expect(areaOf({ subject: "bump deps", files: ["Cargo.lock"] })).toBe("Under the hood");
    expect(areaOf({ subject: "x", files: ["src/playground/sand.ts"] })).toBe("Desktop");
  });

  test("plain titles drop prefixes and PR refs", () => {
    expect(plainTitle("feat(dock): add jelly launch animation (#8)")).toBe("Add jelly launch animation");
    expect(plainTitle("fix: stray clock")).toBe("Stray clock");
  });

  test("groups in fixed order, skips merges and duplicates", () => {
    const g = groupCommits([
      { sha: "1111111aaa", subject: "Merge branch 'main' into x", files: ["src/dock/a.ts"] },
      { sha: "2222222bbb", subject: "feat: slim dock (#8)", files: ["src/dock/styles.ts"] },
      { sha: "3333333ccc", subject: "Slim dock", files: ["src/dock/styles.ts"] },
      { sha: "4444444ddd", subject: "Tidy theme tab", files: ["src/themeux/ThemeTab.tsx"] },
      { sha: "5555555eee", subject: "CI cache", files: [".github/workflows/build.yml"] },
    ]);
    expect(g.map((x) => x.area)).toEqual(["Dock", "Themes", "Under the hood"]);
    expect(g[0].items).toEqual([{ title: "Slim dock", pr: 8, sha: "2222222" }]);
  });
});

describe("LATEST.json validation", () => {
  test("the bundled example is valid", () => {
    const { notes, problems } = parseLatest(example);
    expect(problems).toEqual([]);
    expect(notes!.test_steps.length).toBeGreaterThan(2);
  });

  test("drops bad entries individually and defaults risk", () => {
    const { notes, problems } = parseLatest({
      date: "2026-11-23",
      changes: [{ area: "Dock", title: "ok", detail: "d", pr: 3 }, { area: "Dock" }, { title: "neg pr", pr: -1 }],
      test_steps: [{ id: "x", steps: "go", risk: "extreme" }, { id: "x", steps: "dup" }, { id: "y" }],
      known_issues: ["one", 5, ""],
    });
    expect(notes!.changes.length).toBe(2);
    expect(notes!.changes[1].pr).toBeUndefined();
    expect(notes!.test_steps).toEqual([{ id: "x", area: "General", steps: "go", expected: "", risk: "med" }]);
    expect(notes!.known_issues).toEqual(["one"]);
    expect(problems.length).toBe(3);
  });

  test("garbage falls back to null instead of throwing", () => {
    for (const bad of [null, 42, "text", [], {}, { changes: "no" }]) {
      expect(parseLatest(bad).notes).toBeNull();
    }
  });
});

describe("checklist", () => {
  test("progress counts statuses and open high-risk steps", () => {
    let r = parseResults(null, "b1");
    r = setStep(r, "a", { status: "pass" });
    r = setStep(r, "b", { status: "fail", notes: "broke" });
    const p = progressOf(steps, r);
    expect(p).toMatchObject({ total: 4, done: 2, pass: 1, fail: 1, skip: 0, todo: 2, pct: 50, highRiskOpen: 1 });
  });

  test("visible steps sort by risk and filter", () => {
    let r = parseResults(null, "b1");
    r = setStep(r, "d", { status: "fail" });
    expect(visibleSteps(steps, r, "all").map((s) => s.id)).toEqual(["b", "d", "c", "a"]);
    expect(visibleSteps(steps, r, "open").map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(visibleSteps(steps, r, "failed").map((s) => s.id)).toEqual(["d"]);
    expect(visibleSteps(steps, r, "low").map((s) => s.id)).toEqual(["a"]);
  });

  test("results parsing is defensive", () => {
    const r = parseResults(JSON.stringify({ steps: { a: { status: "weird", notes: 5, screenshots: ["x.png", 3] } } }), "b");
    expect(r.steps.a).toEqual({ status: "todo", notes: "", screenshots: ["x.png"], updatedAt: undefined });
    expect(parseResults("{oops", "b").steps).toEqual({});
  });
});

describe("report text", () => {
  test("markdown includes results, notes and environment", () => {
    let r = parseResults(null, "b1");
    r = setStep(r, "b", { status: "fail", notes: "colours wrong" });
    const md = reportMarkdown(
      { version: "0.2.0", sha: "abcdef123456", builtAt: "2026-11-23" },
      parseLatest({ test_steps: steps, known_issues: ["k"] }).notes,
      r,
      { windows: "Windows 11 (build 26100.1)", cpu: "CPU", gpus: ["GPU"], ramGb: 16, displays: [{ width: 2560, height: 1440, scale: 1.25, primary: true }], lensVersion: "0.2.0" },
      "now"
    );
    expect(md).toContain("0 passed, 1 failed, 0 skipped, 3 not tested (25% done)");
    expect(md).toContain("2560×1440 @ 125% (primary)");
    expect(md).toContain("**Tester notes:** colours wrong");
    expect(md).toContain("## Known issues at build time");
  });

  test("issue title and body summarise failures", () => {
    const failed = [{ step: steps[1], result: { status: "fail" as const, notes: "n", screenshots: [] } }];
    expect(issueTitle(failed)).toBe("Tester report: Themes — b failed");
    expect(issueTitle([])).toBe("Tester report");
    expect(issueBody({ version: "1", sha: "abc" }, null, failed)).toContain("**b** (Themes)");
  });
});
