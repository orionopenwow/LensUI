// Top Bar click-through (src/topbar/clickThrough.ts, app/topbar_hit.rs): the bar reports where its
// controls are so Lens can pass every other click to the app behind it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHitReporter, dropContained, sameRects, type HitRect } from "../topbar/clickThrough";

describe("Top Bar click-through", () => {
  test("controls inside a larger control are folded into it", () => {
    const pill: HitRect = [400, 4, 200, 26];
    const play: HitRect = [420, 6, 20, 20];
    const gear: HitRect = [980, 6, 22, 22];
    expect(dropContained([pill, play, gear])).toEqual([pill, gear]);
  });

  test("two identical rects keep one", () => {
    const a: HitRect = [10, 4, 24, 24];
    expect(dropContained([a, [...a] as HitRect])).toHaveLength(1);
  });

  test("an unchanged layout is not reported again", () => {
    expect(sameRects([[1, 2, 3, 4]], [[1, 2, 3, 4]])).toBe(true);
    expect(sameRects([[1, 2, 3, 4]], [[1, 2, 3, 5]])).toBe(false);
    expect(sameRects([], [[1, 2, 3, 4]])).toBe(false);
  });

  test("the halo only moves a mask (no layout) and is off under reduced motion's transition rules", () => {
    const css = readFileSync(join(import.meta.dir, "../surfaces/TopBarSurface.css"), "utf8");
    const rule = css.slice(css.indexOf('.topbar[data-halo="on"] {'));
    expect(rule).toContain("mask-image");
    expect(rule).not.toMatch(/\b(width|height|left|top|margin|padding)\s*:/);
    expect(css).toContain('.topbar[data-halo="on"] { transition: none; }');
  });

  test("the bar reports its controls and listens for the halo", () => {
    const tsx = readFileSync(join(import.meta.dir, "../surfaces/TopBarSurface.tsx"), "utf8");
    expect(tsx).toContain("useTopbarClickThrough(barRef)");
    const hook = readFileSync(join(import.meta.dir, "../topbar/clickThrough.ts"), "utf8");
    expect(hook).toContain('"set_topbar_hit_rects_cmd"');
    expect(hook).toContain('"lens://topbar-halo"');
  });
});

describe("B-108: a report Lens Core refused is sent again", () => {
  const rects: HitRect[] = [[10, 4, 24, 24]];
  const flush = () => new Promise((r) => setTimeout(r, 0));

  test("the same layout is reported once while it is taken, and again after a refusal", async () => {
    const sent: HitRect[][] = [];
    const failed: unknown[] = [];
    let refuse = true;
    const push = createHitReporter((r) => {
      sent.push(r);
      return refuse ? Promise.reject(new Error("not ready")) : Promise.resolve();
    }, (e) => failed.push(e));

    expect(push(rects)).toBe(true);
    // Still in flight: the same rects are not sent twice.
    expect(push(rects)).toBe(false);
    await flush();
    expect(failed).toHaveLength(1);

    // It used to be remembered as sent here, so the bar's buttons stayed click-through.
    refuse = false;
    expect(push(rects)).toBe(true);
    await flush();
    expect(push(rects)).toBe(false);
    expect(sent).toHaveLength(2);
  });

  test("the first report goes out even when the bar has no controls yet", async () => {
    const sent: HitRect[][] = [];
    const push = createHitReporter((r) => { sent.push(r); return Promise.resolve(); });
    expect(push([])).toBe(true);
    await flush();
    expect(push([])).toBe(false);
    expect(sent).toEqual([[]]);
  });

  test("an older report that answers late never hides a newer layout", async () => {
    const resolvers: (() => void)[] = [];
    const sent: HitRect[][] = [];
    const push = createHitReporter((r) => { sent.push(r); return new Promise<void>((res) => resolvers.push(res)); });
    const wider: HitRect[] = [[10, 4, 60, 24]];
    push(rects);
    push(wider);
    resolvers[1]();
    await flush();
    resolvers[0]();
    await flush();
    expect(push(wider)).toBe(false);
    expect(push(rects)).toBe(true);
  });
});
