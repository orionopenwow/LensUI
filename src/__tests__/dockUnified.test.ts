// Unified Dock style, window-count marks, the window carousel, hover-card placement, smooth reflow
// and the two-line clock (docs/features/dock.md › Unified).
import { describe, expect, test } from "bun:test";
import {
  DOCK_STYLES,
  dockShowsLauncher,
  dockStyleIconSize,
  dockStyleInfo,
  normalizeDockStyle,
  resolveDockAlignment,
  resolveSystemArea,
} from "../dock/styles";
import { windowMark, windowMarkClass, windowMarkLabel } from "../dock/marks";
import { counterText, initialIndex, jumps, reconcileIndex, slideOffset, stepIndex, wheelStep, wrapIndex, WHEEL_STEP_MS } from "../dock/carousel";
import { cardBox, placeHoverCard, type CardEdge } from "../dock/placement";
import { planReflow } from "../dock/reflow";
import { stackedClock } from "../dock/clock";

describe("Unified style normalisation", () => {
  test("is a known, floating (not full-width) style with the system area in the Dock", () => {
    expect(normalizeDockStyle("unified")).toBe("unified");
    const info = dockStyleInfo("unified");
    expect(info.label).toBe("Unified");
    expect(info.fullWidth).toBe(false);
    expect(info.systemInDockByDefault).toBe(true);
    expect(info.description).toMatch(/one floating pill/i);
    expect(DOCK_STYLES.filter((s) => s.id === "unified")).toHaveLength(1);
  });

  test("Floating stays the default and unknown values fall back to it", () => {
    expect(DOCK_STYLES[0].id).toBe("floating");
    for (const v of [undefined, null, "", "Unified", "UNIFIED", " unified", "pill"]) expect(normalizeDockStyle(v)).toBe("floating");
  });

  test("system area: auto puts tray and clock in the pill; Top Bar choice is kept unless the Top Bar is off", () => {
    expect(resolveSystemArea({ style: "unified", systemArea: "auto" }, { enabled: true })).toBe("dock");
    expect(resolveSystemArea({ style: "unified" }, { enabled: true })).toBe("dock");
    expect(resolveSystemArea({ style: "unified", systemArea: "topbar" }, { enabled: true })).toBe("topbar");
    expect(resolveSystemArea({ style: "unified", systemArea: "topbar" }, { enabled: false })).toBe("dock");
  });

  test("Launcher first, centred, icon size capped at 40", () => {
    expect(dockShowsLauncher("unified")).toBe(true);
    expect(dockShowsLauncher("floating")).toBe(false);
    expect(resolveDockAlignment("unified", "left")).toBe("center");
    expect(dockStyleIconSize("unified", 56)).toBe(40);
    expect(dockStyleIconSize("unified", 32)).toBe(32);
    expect(dockStyleIconSize("unified", Number.NaN)).toBeLessThanOrEqual(40);
  });
});

describe("window-count marks", () => {
  test("one dash for one window, three dots for two or more, nothing otherwise", () => {
    expect(windowMark(0)).toBe("none");
    expect(windowMark(-3)).toBe("none");
    expect(windowMark(Number.NaN)).toBe("none");
    expect(windowMark(1)).toBe("dash");
    for (const n of [2, 3, 9, 120]) expect(windowMark(n)).toBe("dots");
    expect(windowMarkClass(1)).toBe("");
    expect(windowMarkClass(2)).toBe("is-multi");
    expect(windowMarkLabel(3)).toBe(", 3 windows");
    expect(windowMarkLabel(1)).toBe("");
  });
});

describe("window carousel index logic", () => {
  test("stepping wraps both ways", () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(1, 3, -5)).toBe(0); // a big wheel delta is still one step
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(4, 0, 1)).toBe(0);
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(9, 4)).toBe(1);
    expect(wrapIndex(Number.NaN, 4)).toBe(0);
  });

  test("starts on the focused window", () => {
    expect(initialIndex([{}, { isFocused: true }, {}])).toBe(1);
    expect(initialIndex([{}, {}])).toBe(0);
  });

  test("offsets: centre 0, neighbours ±1, the short way round", () => {
    expect([0, 1, 2].map((i) => slideOffset(i, 0, 3))).toEqual([0, 1, -1]);
    expect([0, 1, 2, 3, 4].map((i) => slideOffset(i, 2, 5))).toEqual([-2, -1, 0, 1, 2]);
    expect([0, 1, 2, 3, 4].map((i) => slideOffset(i, 0, 5))).toEqual([0, 1, 2, -2, -1]);
    // Two windows: the other one always peeks in on the right only.
    expect([0, 1].map((i) => slideOffset(i, 0, 2))).toEqual([0, 1]);
    expect([0, 1].map((i) => slideOffset(i, 1, 2))).toEqual([1, 0]);
  });

  test("exactly one centre slide for every index and count", () => {
    for (let n = 2; n <= 9; n++) {
      for (let idx = 0; idx < n; idx++) {
        const offs = Array.from({ length: n }, (_, i) => slideOffset(i, idx, n));
        expect(offs.filter((d) => d === 0)).toHaveLength(1);
        expect(offs[idx]).toBe(0);
        expect(new Set(offs).size).toBe(n);
      }
    }
  });

  test("the wrap moves the far slide without animating it across the centre", () => {
    // 3 windows, 0 → 1: window 2 goes from -1 to +1 (would sweep through the centre).
    expect(jumps(slideOffset(2, 0, 3), slideOffset(2, 1, 3))).toBe(true);
    expect(jumps(slideOffset(1, 0, 3), slideOffset(1, 1, 3))).toBe(false);
    expect(jumps(slideOffset(0, 0, 3), slideOffset(0, 1, 3))).toBe(false);
  });

  test("counter, closing windows and the wheel", () => {
    expect(counterText(1, 3)).toBe("2/3");
    expect(counterText(5, 3)).toBe("3/3");
    expect(counterText(0, 0)).toBe("0/0");
    // The current window stays current when another closes; a closed current keeps the position.
    expect(reconcileIndex([10, 20, 30], 2, [10, 30])).toBe(1);
    expect(reconcileIndex([10, 20, 30], 1, [10, 30])).toBe(1);
    expect(reconcileIndex([10, 20, 30], 2, [10, 20])).toBe(1);
    expect(reconcileIndex([10, 20], 0, [])).toBe(0);
    expect(wheelStep(0, 40, 0, 1000)).toBe(1);
    expect(wheelStep(0, -40, 0, 1000)).toBe(-1);
    expect(wheelStep(-60, 10, 0, 1000)).toBe(-1);
    expect(wheelStep(0, 40, 1000, 1000 + WHEEL_STEP_MS - 1)).toBe(0);
    expect(wheelStep(0, 0.2, 0, 1000)).toBe(0);
  });
});

describe("hover card placement", () => {
  const EDGES: CardEdge[] = ["bottom", "top", "left", "right"];
  test("the card stays inside the usable area on every edge, for icons at the extremes", () => {
    const m = 8;
    for (const edge of EDGES) {
      const vertical = edge === "left" || edge === "right";
      const [viewW, viewH] = vertical ? [760, 1080] : [1920, 760];
      // Cards are capped at the view less 24 px in CSS (max-width: calc(100vw - 24px)).
      for (const [w, h] of [[248, 160], [440, 268], [Math.min(900, viewW - 24), 220]]) {
        for (const t of [0, 0.02, 0.5, 0.98, 1]) {
          const x = vertical ? (edge === "left" ? 64 : viewW - 64) : t * viewW;
          const y = vertical ? t * viewH : edge === "top" ? 64 : viewH - 64;
          const topInset = edge === "top" ? 0 : 34;
          const pos = placeHoverCard({ edge, x, y, w, h, viewW, viewH, topInset });
          const b = cardBox(edge, pos, w, h);
          expect(b.left).toBeGreaterThanOrEqual(m - 0.01);
          expect(b.right).toBeLessThanOrEqual(viewW - m + 0.01);
          expect(b.top).toBeGreaterThanOrEqual(topInset + m - 0.01);
          expect(b.bottom).toBeLessThanOrEqual(viewH - m + 0.01);
        }
      }
    }
  });

  test("a card that fits sits on its icon, the gap away from it", () => {
    const pos = placeHoverCard({ edge: "bottom", x: 960, y: 700, w: 440, h: 268, viewW: 1920, viewH: 760 });
    expect(pos).toEqual({ left: 960, top: 688 });
    const side = placeHoverCard({ edge: "left", x: 70, y: 540, w: 440, h: 268, viewW: 760, viewH: 1080 });
    expect(side).toEqual({ left: 82, top: 540 });
  });
});

describe("smooth reflow plan", () => {
  test("moved icons glide back from where they were; new ones grow in; first paint does nothing", () => {
    const before = new Map([["a", 100], ["b", 150], ["c", 200]]);
    const after = new Map([["a", 80], ["c", 130], ["d", 180], ["b", 230]]);
    const plan = planReflow(before, after);
    expect(plan.moves.get("a")).toBe(20);
    expect(plan.moves.get("c")).toBe(70);
    expect(plan.moves.get("b")).toBe(-80);
    expect(plan.entered).toEqual(["d"]);
    expect(planReflow(new Map(), after).entered).toEqual([]);
    expect(planReflow(before, new Map([["a", 100.2]])).moves.size).toBe(0);
  });
});

describe("two-line clock", () => {
  const d = new Date(2026, 10, 26, 13, 5);
  test("short weekday, day and month in the locale's order, no commas", () => {
    expect(stackedClock(d, null, "en-GB").date).toBe("Thu 26 Nov");
    expect(stackedClock(d, null, "en-US").date).toBe("Thu Nov 26");
  });
  test("follows Windows' 12/24-hour choice", () => {
    expect(stackedClock(d, true, "en-US").time).toBe("13:05");
    expect(stackedClock(d, false, "en-GB").time.toLowerCase().replace(/\s/g, " ")).toMatch(/^1:05\s?pm$/);
  });
});
