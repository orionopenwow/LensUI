// The browser benchmark's pure helpers (tools/perf/browser-bench.mjs): medians, p95, fixed page.
import { describe, expect, test } from "bun:test";
const { benchPage, median, p95 } = await import("../../tools/perf/browser-bench.mjs");

describe("browser bench helpers", () => {
  test("median and p95", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
    expect(p95([7])).toBe(7);
  });
  test("the bench page is the same bytes every run", () => {
    expect(benchPage(3)).toBe(benchPage(3));
    expect(benchPage(3)).toContain("<title>Bench page 3</title>");
    expect(benchPage(0).length).toBeGreaterThan(5000);
  });
});
