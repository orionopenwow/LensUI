// Top Bar click-through (src/topbar/clickThrough.ts, app/topbar_hit.rs): the bar reports where its
// controls are so Lens can pass every other click to the app behind it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dropContained, sameRects, type HitRect } from "../topbar/clickThrough";

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
