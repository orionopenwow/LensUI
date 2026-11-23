// Property tests for the frontend's pure geometry and config normalisers (docs/TESTING.md ›
// Property tests). A tiny seeded generator keeps them dependency-free and repeatable; set
// PROP_RUNS to run more cases (CI nightly uses 20000).
import { describe, expect, test } from "bun:test";
import { contains, hitRect, offsetFromPoint, panelRect, tabRect, tabVisible, type Edge, type EdgeSettings } from "../command/mini/edgeGeometry";
import {
  clampMagnificationRange,
  dockStyleIconSize,
  normalizeDockStyle,
  normalizeLaunchAnimation,
  normalizeMagnification,
  resolveDockAlignment,
  DOCK_STYLES,
} from "../dock/styles";

const RUNS = Number(process.env.PROP_RUNS || 2000);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const EDGES: Edge[] = ["left", "right", "top", "bottom"];

function genEdge(r: () => number) {
  const area = { x: int(r, -4000, 4000), y: int(r, -2000, 2000), w: int(r, 800, 5120), h: int(r, 600, 2880) };
  const s: EdgeSettings = {
    enabled: r() < 0.8,
    edge: pick(r, EDGES),
    offset: r() < 0.1 ? r() * 4 - 2 : r(), // sometimes out of range: must be clamped
    thickness: int(r, 2, 24),
    length: int(r, 40, 400),
    panel: { w: int(r, 200, 760), h: int(r, 200, 560) },
    hoverMs: int(r, 0, 1000),
  };
  return { area, s };
}
const inside = (outer: { x: number; y: number; w: number; h: number }, r: { x: number; y: number; w: number; h: number }) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;

describe("Edge Shelf geometry (properties)", () => {
  test("the tab sits flush on its edge, inside the work area", () => {
    const r = rng(1);
    for (let i = 0; i < RUNS; i++) {
      const { area, s } = genEdge(r);
      const t = tabRect(area, s);
      expect(inside(area, t)).toBe(true);
      if (s.edge === "left") expect(t.x).toBe(area.x);
      if (s.edge === "right") expect(t.x + t.w).toBe(area.x + area.w);
      if (s.edge === "top") expect(t.y).toBe(area.y);
      if (s.edge === "bottom") expect(t.y + t.h).toBe(area.y + area.h);
    }
  });

  test("the panel stays inside the work area with its margin and grows from the tab's edge", () => {
    const r = rng(2);
    for (let i = 0; i < RUNS; i++) {
      const { area, s } = genEdge(r);
      const p = panelRect(area, s, 8);
      expect(p.w).toBe(s.panel.w);
      expect(p.h).toBe(s.panel.h);
      const m = { x: area.x + 8, y: area.y + 8, w: area.w - 16, h: area.h - 16 };
      expect(inside(m, p)).toBe(true);
      if (s.edge === "left") expect(p.x).toBe(area.x + 8);
      if (s.edge === "bottom") expect(p.y + p.h).toBe(area.y + area.h - 8);
    }
  });

  test("the hit zone always contains the whole tab", () => {
    const r = rng(3);
    for (let i = 0; i < RUNS; i++) {
      const { area, s } = genEdge(r);
      const t = tabRect(area, s);
      const h = hitRect(area, s, int(r, 0, 20));
      expect(contains(h, t.x, t.y)).toBe(true);
      expect(contains(h, t.x + t.w - 1, t.y + t.h - 1)).toBe(true);
    }
  });

  test("dragging the tab anywhere gives an offset that round-trips onto the same edge", () => {
    const r = rng(4);
    for (let i = 0; i < RUNS; i++) {
      const { area, s } = genEdge(r);
      const off = offsetFromPoint(area, s.edge, int(r, area.x - 500, area.x + area.w + 500), int(r, area.y - 500, area.y + area.h + 500));
      expect(off).toBeGreaterThanOrEqual(0.05);
      expect(off).toBeLessThanOrEqual(0.95);
      expect(inside(area, tabRect(area, { ...s, offset: off }))).toBe(true);
    }
  });

  test("the tab never shows over a fullscreen app or game", () => {
    const r = rng(5);
    for (let i = 0; i < 200; i++) {
      const { s } = genEdge(r);
      expect(tabVisible(s, true, r() < 0.5, r() < 0.5)).toBe(false);
    }
  });
});

describe("Dock config normalisers (fuzz)", () => {
  const junk = (r: () => number): any =>
    pick(r, [undefined, null, "", " ", "TASKBAR", "Taskbar ", "floating", "slim", "nope", "<script>", 42, -1, NaN, Infinity, {}, [], "classic", "jelly"]);

  test("any stored value maps to a known style, animation and magnification", () => {
    const r = rng(6);
    const ids = DOCK_STYLES.map((d) => d.id);
    for (let i = 0; i < RUNS; i++) {
      const v = junk(r);
      expect(ids).toContain(normalizeDockStyle(v));
      expect(["off", "subtle", "classic"]).toContain(normalizeMagnification(v));
      expect(["none", "lift", "bounce", "jelly"]).toContain(normalizeLaunchAnimation(v));
      const range = clampMagnificationRange(typeof v === "number" ? v : int(r, -10, 10));
      expect(Number.isFinite(range)).toBe(true);
      expect(range).toBeGreaterThanOrEqual(1);
      expect(range).toBeLessThanOrEqual(4);
      expect(["center", "left"]).toContain(resolveDockAlignment(normalizeDockStyle(v), v));
    }
  });

  test("icon sizes from a sane config stay within the style's caps", () => {
    const r = rng(7);
    for (let i = 0; i < RUNS; i++) {
      const style = pick(r, DOCK_STYLES).id;
      const configured = int(r, 16, 96);
      const size = dockStyleIconSize(style, configured);
      expect(size).toBeLessThanOrEqual(configured);
      if (style === "slim") expect(size).toBeLessThanOrEqual(32);
    }
  });

  // Finding F2 (docs/TESTING.md › Findings): dock.iconSize is never clamped, so a hand-edited or
  // restored config with 0 or 5000 gives an invisible or screen-sized Dock. Runs with `bun test --todo`.
  test("F2: any configured icon size, however wrong, gives a usable icon (12–128 px)", () => {
    const r = rng(8);
    for (let i = 0; i < RUNS; i++) {
      const style = pick(r, DOCK_STYLES).id;
      const size = dockStyleIconSize(style, pick(r, [int(r, -100, 400), NaN, Infinity, 0] as number[]));
      expect(Number.isFinite(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(12);
      expect(size).toBeLessThanOrEqual(128);
    }
  });
});
