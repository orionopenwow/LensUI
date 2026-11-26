import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const css = readFileSync(join(root, "src/styles/lens-cloud.css"), "utf8").trim();

describe("lens-cloud orb", () => {
  test("the website carries an exact copy of the shared cloud CSS", () => {
    const site = readFileSync(join(root, "docs/site/css/site.css"), "utf8");
    const m = site.match(/\/\* LENS-CLOUD:BEGIN[^*]*\*\/\n([\s\S]*?)\n\/\* LENS-CLOUD:END \*\//);
    expect(m).not.toBeNull();
    expect(m![1].trim()).toBe(css);
  });
  test("no orb spins any more", () => {
    for (const f of ["docs/site/css/site.css", "src/presence/presence.css", "src/styles/lens-cloud.css"]) {
      expect(readFileSync(join(root, f), "utf8")).not.toMatch(/orb-spin|rotate:\s*360deg/);
    }
  });
  test("the cloud only animates transform, opacity and filter, and stills for reduced motion", () => {
    const frames = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}/g)].map((m) => m[1]);
    for (const f of frames) for (const prop of f.matchAll(/([a-z-]+):/g)) expect(["transform", "border-radius", "filter"]).toContain(prop[1]);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.lens-cloud, \.lens-cloud i \{ animation: none/);
  });
});

describe("Lens Cloud backdrop preset", () => {
  test("Backdrop Lab has a Lens Cloud preset built from the cloud's own six hues", async () => {
    const { PRESETS } = await import("../studio/backdrop/engine/presets");
    const { hexToRgb } = await import("../studio/backdrop/engine/color");
    const preset = PRESETS.find((p) => p.id === "lens-cloud")!;
    expect(preset).toBeDefined();
    expect(preset.name).toBe("Lens Cloud");
    expect(preset.group).toBe("Lens");
    // The hues in lens-cloud.css, as hex.
    const hsl = [...css.matchAll(/hsl\((\d+) (\d+)% (\d+)%\)/g)].map((m) => [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]);
    expect(hsl).toHaveLength(6);
    const toRgb = ([h, s, l]: number[]) => {
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      };
      return [f(0), f(8), f(4)];
    };
    const stops = preset.state.stops.map((stop) => hexToRgb(stop.color));
    for (const hue of hsl.map(toRgb)) {
      const close = stops.some((c) => Math.hypot(c[0] - hue[0], c[1] - hue[1], c[2] - hue[2]) < 0.02);
      expect(close).toBe(true);
    }
    // It starts from the cloud's own near-black and moves slowly.
    expect(preset.state.stops[0].color.toUpperCase()).toBe("#050507");
    expect(preset.state.speed).toBeLessThanOrEqual(0.12);
  });
});
