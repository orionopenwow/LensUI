// Dock music pop-out: level smoothing, visibility gating, glow colours (and their contrast on
// every built-in pack, dark and light), meter/glow frames, seeking and time labels.
import { describe, expect, test } from "bun:test";
import {
  GLOW_MAX_ALPHA, GLOW_MIN_BEHIND, LEVEL_ASK_MS, REST_BAR, STATIC_BARS, cssToHex, glowFrame, glowPlan, levelLoopActive, livePositionMs, meterBars,
  progressLabels, seekFromKey, seekFromPointer, smoothLevel,
} from "../music/soundGlow";
import { contrast, formatTime, hexToRgb, mix, type RGB } from "../music/model";
import { THEME_PACKS } from "../themes/packs";

const p = (r: number, g: number, b: number, weight = 0.3) => ({ color: { r, g, b }, weight });

describe("level smoothing", () => {
  test("attacks fast and releases slowly", () => {
    const up = smoothLevel(0, 1);
    expect(up).toBeGreaterThan(0.5);
    const down = smoothLevel(1, 0);
    expect(down).toBeGreaterThan(0.9);
    expect(1 - down).toBeLessThan(up);
  });
  test("is frame-rate independent", () => {
    // Two 60 Hz frames land where one 30 Hz frame does.
    const twice = smoothLevel(smoothLevel(0.2, 0.9, 1000 / 60), 0.9, 1000 / 60);
    expect(smoothLevel(0.2, 0.9, 1000 / 30)).toBeCloseTo(twice, 6);
  });
  test("clamps bad input and never leaves 0..1", () => {
    expect(smoothLevel(0.4, Number.NaN)).toBeLessThan(0.4);
    expect(smoothLevel(Number.NaN, 0.5)).toBeGreaterThan(0);
    expect(smoothLevel(0.9, 7)).toBeLessThanOrEqual(1);
    expect(smoothLevel(0.1, -3)).toBeGreaterThanOrEqual(0);
    // A long stall (window was hidden) jumps at most a quarter-second's worth.
    expect(smoothLevel(1, 0, 60_000)).toBeCloseTo(smoothLevel(1, 0, 250), 9);
  });
  test("settles on a steady level", () => {
    let l = 0;
    for (let i = 0; i < 400; i++) l = smoothLevel(l, 0.6);
    expect(l).toBeCloseTo(0.6, 3);
  });
});

describe("visibility gating", () => {
  const on = { open: true, playing: true, glow: true, meter: true, reduced: false, hidden: false };
  test("runs only while open, playing, wanted and moving", () => {
    expect(levelLoopActive(on)).toBe(true);
    expect(levelLoopActive({ ...on, open: false })).toBe(false);
    expect(levelLoopActive({ ...on, playing: false })).toBe(false);
    expect(levelLoopActive({ ...on, glow: false, meter: false })).toBe(false);
    expect(levelLoopActive({ ...on, glow: false })).toBe(true);
    expect(levelLoopActive({ ...on, meter: false })).toBe(true);
    expect(levelLoopActive({ ...on, reduced: true })).toBe(false);
    expect(levelLoopActive({ ...on, hidden: true })).toBe(false);
  });
  test("asks the backend at most ~30 times a second", () => {
    expect(1000 / LEVEL_ASK_MS).toBeLessThanOrEqual(31);
  });
});

describe("meter and glow frames", () => {
  test("bars rest when paused, hold a still pose when motion is reduced", () => {
    expect(meterBars(1, 0, { playing: false, reduced: false })).toEqual([REST_BAR, REST_BAR, REST_BAR, REST_BAR, REST_BAR]);
    expect(meterBars(1, 1234, { playing: true, reduced: true })).toEqual(STATIC_BARS);
    expect(meterBars(0.7, 5555, { playing: true, reduced: true })).toEqual(meterBars(0.1, 99, { playing: true, reduced: true }));
  });
  test("bars follow the level and stay in range", () => {
    const quiet = meterBars(0.05, 100, { playing: true, reduced: false });
    const loud = meterBars(1, 100, { playing: true, reduced: false });
    expect(loud.length).toBe(5);
    loud.forEach((b, i) => {
      expect(b).toBeGreaterThan(quiet[i]);
      expect(b).toBeLessThanOrEqual(1);
      expect(quiet[i]).toBeGreaterThanOrEqual(REST_BAR);
    });
  });
  test("glow breathes with the level, still when reduced", () => {
    const lo = glowFrame(0, { playing: true, reduced: false });
    const hi = glowFrame(1, { playing: true, reduced: false });
    expect(hi.opacity).toBeGreaterThan(lo.opacity);
    expect(hi.scale).toBeGreaterThan(lo.scale);
    expect(hi.scale).toBeLessThanOrEqual(1);
    expect(hi.opacity).toBeLessThanOrEqual(1);
    expect(glowFrame(1, { playing: true, reduced: true })).toEqual(glowFrame(0, { playing: true, reduced: true }));
  });
});

describe("glow colours", () => {
  test("uses the artwork's vivid colour and a second distinct one", () => {
    const plan = glowPlan([p(20, 20, 24, 0.6), p(230, 40, 90, 0.25), p(40, 120, 230, 0.15)], "#fafafa", "#09090b", ["#fafafa"]);
    expect(plan.fromArt).toBe(true);
    expect(plan.colors[0]).not.toBe(plan.colors[1]);
    expect(plan.colors).toContain("#e6285a");
  });
  test("falls back to the theme accent without artwork", () => {
    const plan = glowPlan([], "#818CF8", "#050507", ["#fafafa"]);
    expect(plan.fromArt).toBe(false);
    expect(plan.colors[0]).toBe("#818cf8");
    // A bad accent still gives a colour (Lens white).
    expect(glowPlan([], "not-a-colour", "#09090b", ["#fafafa"]).colors[0]).toBe("#fafafa");
  });
  test("one-colour artwork gets a deeper second tone", () => {
    const plan = glowPlan([p(200, 60, 60, 1)], "#fafafa", "#09090b", ["#fafafa"]);
    expect(plan.colors[0]).not.toBe(plan.colors[1]);
  });

  const arts: { color: RGB; weight: number }[][] = [
    [],
    [p(255, 255, 255, 1)],
    [p(0, 0, 0, 1)],
    [p(230, 40, 90), p(40, 120, 230)],
    [p(250, 220, 60), p(255, 250, 240)],
    [p(20, 60, 40), p(120, 120, 120)],
  ];
  test("text over the glow keeps 4.5:1 on every pack, dark and light", () => {
    for (const pack of THEME_PACKS) {
      const light = pack.scheme === "light";
      const base = pack.base ?? "#09090B";
      const fg = light ? "#18181b" : "#fafafa";
      for (const art of arts) {
        const plan = glowPlan(art, pack.accent, base, [fg]);
        expect(plan.alpha).toBeLessThanOrEqual(GLOW_MAX_ALPHA);
        if (plan.placement === "behind") {
          expect(plan.alpha).toBeGreaterThanOrEqual(GLOW_MIN_BEHIND);
          for (const c of plan.colors) {
            const t = mix(hexToRgb(base)!, hexToRgb(c)!, plan.alpha);
            const tinted = { r: Math.round(t.r), g: Math.round(t.g), b: Math.round(t.b) };
            expect(contrast(hexToRgb(fg)!, tinted)).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
  test("a glow that would hurt contrast moves below the controls", () => {
    // White glow on a dark base with white text: no alpha keeps 4.5:1 at a useful strength.
    const plan = glowPlan([p(255, 255, 255, 1)], "#fafafa", "#6b6b6b", ["#fafafa"]);
    expect(plan.placement).toBe("below");
  });
  test("reads computed CSS colours", () => {
    expect(cssToHex("rgb(9, 9, 11)")).toBe("#09090b");
    expect(cssToHex("rgba(250, 250, 250, 0.5)")).toBe("#fafafa");
    expect(cssToHex("rgb(9 9 11)")).toBe("#09090b");
    expect(cssToHex(" #FFF ")).toBe("#ffffff");
    expect(cssToHex("color(display-p3 1 0 0)")).toBeNull();
  });
});

describe("timeline", () => {
  test("time formatting", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65_000)).toBe("1:05");
    expect(formatTime(3_723_000)).toBe("1:02:03");
    expect(formatTime(-5)).toBe("0:00");
    expect(progressLabels(65_400, 222_000, formatTime)).toEqual({ elapsed: "1:05", total: "3:42" });
    expect(progressLabels(999_999, 222_000, formatTime).elapsed).toBe("3:42");
    expect(progressLabels(5_000, 0, formatTime)).toEqual({ elapsed: "–:––", total: "–:––" });
  });
  test("live position extrapolates only while playing", () => {
    const m = { positionMs: 10_000, durationMs: 200_000, updatedMs: 1_000, isPlaying: true };
    expect(livePositionMs(m, 3_000)).toBe(12_000);
    expect(livePositionMs({ ...m, isPlaying: false }, 3_000)).toBe(10_000);
    expect(livePositionMs(m, 10_000_000)).toBe(200_000);
    expect(livePositionMs({ ...m, updatedMs: 0 }, 3_000)).toBe(10_000);
  });
  test("pointer seeking maps and clamps", () => {
    expect(seekFromPointer(150, 100, 200, 200_000)).toBe(50_000);
    expect(seekFromPointer(0, 100, 200, 200_000)).toBe(0);
    expect(seekFromPointer(999, 100, 200, 200_000)).toBe(200_000);
    expect(seekFromPointer(150, 100, 0, 200_000)).toBe(0);
  });
  test("keyboard seeking", () => {
    expect(seekFromKey("ArrowRight", 10_000, 200_000)).toBe(15_000);
    expect(seekFromKey("ArrowLeft", 2_000, 200_000)).toBe(0);
    expect(seekFromKey("PageUp", 10_000, 200_000)).toBe(30_000);
    expect(seekFromKey("Home", 10_000, 200_000)).toBe(0);
    expect(seekFromKey("End", 10_000, 200_000)).toBe(199_000);
    expect(seekFromKey("a", 10_000, 200_000)).toBeNull();
    expect(seekFromKey("ArrowRight", 10_000, 0)).toBeNull();
  });
});
