// The motion engine (src/ui/motion) and the motion lint (tools/polish/motion-lint.mjs).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flipDelta } from "../ui/motion/flip";
import { poseKeyframe, poseTransform } from "../ui/motion/glide";
import { springAt, springDuration, springEasing } from "../ui/motion/spring";
import { DURATION_MS, duration, parseMs } from "../ui/motion/tokens";
// @ts-expect-error plain .mjs tool, no types
import { BASELINE, grown, lintCss, lintTree, lintTs, totals } from "../../tools/polish/motion-lint.mjs";

const ROOT = join(import.meta.dir, "..", "..");

describe("tokens", () => {
  test("fallback durations match motion.css", () => {
    const css = readFileSync(join(ROOT, "src", "styles", "motion.css"), "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("@media"));
    for (const [k, v] of Object.entries(DURATION_MS)) expect({ k, ok: new RegExp(`--lens-dur-${k}:\\s*${v}ms`).test(root) }).toEqual({ k, ok: true });
    expect(duration("base")).toBe(180);
  });
  test("parseMs", () => {
    expect(parseMs("180ms")).toBe(180);
    expect(parseMs(" 0.24s ")).toBe(240);
    expect(parseMs("fast")).toBeNull();
  });
});

describe("spring", () => {
  test("starts at 0, settles at 1, may overshoot a little", () => {
    expect(springAt(0)).toBeCloseTo(0, 5);
    expect(springAt(2)).toBeCloseTo(1, 3);
    const peak = Math.max(...Array.from({ length: 120 }, (_, i) => springAt(i / 120)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.25);
    // Critically damped: never overshoots.
    const flat = Math.max(...Array.from({ length: 240 }, (_, i) => springAt(i / 120, { stiffness: 400, damping: 40 })));
    expect(flat).toBeLessThanOrEqual(1.0001);
  });
  test("becomes a linear() easing with a sensible duration", () => {
    const s = springEasing();
    expect(s.easing.startsWith("linear(0, ")).toBe(true);
    expect(s.easing.endsWith(", 1)")).toBe(true);
    expect(s.duration).toBeGreaterThan(150);
    expect(s.duration).toBeLessThanOrEqual(1200);
    expect(springDuration({ stiffness: 900, damping: 60 })).toBeLessThan(springDuration({ stiffness: 120, damping: 14 }));
  });
});

describe("poses and FLIP", () => {
  test("poses only ever produce transform, opacity and clip-path", () => {
    expect(poseTransform({})).toBe("none");
    expect(poseTransform({ x: 4, y: -6, scale: 0.96 })).toBe("translate(4px, -6px) scale(0.96, 0.96)");
    const k = poseKeyframe({ y: 6, opacity: 0, clip: [0, 120, 0, 0, 8] }, "0 0");
    expect(Object.keys(k).sort()).toEqual(["clipPath", "opacity", "transform", "transformOrigin"]);
    expect(k.clipPath).toBe("inset(0px 120px 0px 0px round 8px)");
  });

  test("additive poses leave the element's own transform alone", () => {
    const k = poseKeyframe({ y: 4, scale: 0.98, opacity: 0 }, undefined, true);
    expect(k.transform).toBeUndefined();
    expect(k.translate).toBe("0px 4px");
    expect(k.scale).toBe("0.98 0.98");
    expect(k.opacity).toBe(0);
  });
  test("flip delta maps the new box back onto the old one", () => {
    const d = flipDelta({ left: 100, top: 50, width: 40, height: 40 }, { left: 300, top: 50, width: 20, height: 20 });
    expect(d).toMatchObject({ x: -200, y: 0, scaleX: 2, scaleY: 2, still: false });
    expect(flipDelta({ left: 1, top: 1, width: 10, height: 10 }, { left: 1.2, top: 1, width: 10, height: 10 }).still).toBe(true);
    expect(flipDelta({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 0, height: 0 })).toMatchObject({ scaleX: 1, scaleY: 1 });
  });
});

describe("motion lint", () => {
  test("flags layout transitions, transition: all and layout keyframes in CSS", () => {
    const f = lintCss(`
      .a { transition: all 200ms ease; }
      .b { transition:
        width var(--lens-dur-slow) var(--lens-ease-out),
        opacity var(--lens-dur-fast) var(--lens-ease-out); }
      .c { transition: transform 1s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 1s; }
      @keyframes grow { from { max-height: 0; opacity: 0 } to { max-height: 600px; opacity: 1 } }
      @keyframes fine { from { transform: scale(0.96) } to { transform: none } }
      .d { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
      .e { backdrop-filter: none; }
      /* .f { transition: height 1s; } */
    `);
    expect(f.map((x: { rule: string }) => x.rule).sort()).toEqual(["backdrop-filter", "layout-keyframes", "layout-transition", "transition-all"]);
    expect(f.find((x: { rule: string }) => x.rule === "layout-transition").line).toBe(3);
  });
  test("flags inline animation strings, timers as animation clocks and native resizes in TSX", () => {
    const f = lintTs(`
      const a = <div style={{ transition: "width 260ms ease" }} />;
      const t = window.setTimeout(() => { setClosing(false); }, 200);
      const ok = window.setTimeout(() => refresh(), 5000);
      win.setSize(new LogicalSize(1, 2));
      invoke("set_settings_content_height_cmd", { height: 1 });
      // invoke("set_desktop_folder_expanded_cmd") in a comment is fine
    `);
    expect(f.map((x: { rule: string }) => x.rule).sort()).toEqual(["inline-animation", "layout-transition", "native-resize", "native-resize", "timer-animation"]);
  });
  test("ratchet: no file grows past the baseline", () => {
    const { counts } = lintTree(ROOT);
    const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE), "utf8"));
    expect(grown(counts, baseline)).toEqual([]);
    // The headline bans stay at zero.
    expect(totals(counts)["transition-all"]).toBe(0);
  });
  test("the engine itself is transform/opacity only", () => {
    for (const f of ["glide.ts", "flip.ts", "Presence.tsx", "useSurfaceTransition.ts"]) {
      const s = readFileSync(join(ROOT, "src", "ui", "motion", f), "utf8").replace(/\/\/[^\n]*/g, "");
      expect({ f, layout: s.match(/\.style\.(width|height|top|left|margin\w*|padding\w*)\b/g) }).toEqual({ f, layout: null });
    }
  });
});
