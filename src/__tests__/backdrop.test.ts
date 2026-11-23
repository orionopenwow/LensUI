// Backdrop Lab: colour maths, state, looks, presets, living wallpaper maths, themes, scene options.
// GPU checks (compile, NaN, seam, flash) run in tools/parity/backdrop (headless WebGL).
import { describe, expect, test } from "bun:test";
import {
  LUT_SIZE,
  MODES,
  PACK_SOURCES,
  PRESETS,
  RANGES,
  adjustState,
  allPresets,
  applyReactions,
  backdropToPack,
  blendColors,
  buildLut,
  contrast,
  cssGradient,
  decodeState,
  defaultState,
  encodeState,
  evenStops,
  evolve,
  evolveBounds,
  exportFrameTimes,
  extractPalette,
  fromLensBg,
  gamutMapOklch,
  harmony,
  hexToRgb,
  inspire,
  interpolateStates,
  keyframeBlend,
  keyframeState,
  linearToOklab,
  LoopClock,
  mixIn,
  normaliseState,
  oklabToLinear,
  oklabToOklch,
  oklchToOklab,
  parseHexList,
  phaseAt,
  playlistIndex,
  playlistNextIn,
  promptToState,
  rgbToHex,
  sampleGradient,
  shareLink,
  srgbToLinear,
  srgbToOklab,
  srgbToOklch,
  toLensBg,
  type BackdropState,
  type Vec3,
} from "../studio/backdrop/engine";
import { THEME_PACKS, validateCustomPack } from "../themes/packs";
import { normaliseOptions } from "../playground/types";

const close = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;

describe("colour spaces", () => {
  test("OKLab reference values (Ottosson's published examples)", () => {
    // sRGB white → L = 1, a = b = 0.
    const w = srgbToOklab([1, 1, 1]);
    expect(close(w[0], 1, 1e-3) && close(w[1], 0, 1e-3) && close(w[2], 0, 1e-3)).toBe(true);
    // sRGB red ≈ (0.62796, 0.22486, 0.12585).
    const r = srgbToOklab([1, 0, 0]);
    expect(close(r[0], 0.62796, 2e-3)).toBe(true);
    expect(close(r[1], 0.22486, 2e-3)).toBe(true);
    expect(close(r[2], 0.12585, 2e-3)).toBe(true);
    // Black → 0.
    expect(srgbToOklab([0, 0, 0]).every((v) => close(v, 0, 1e-6))).toBe(true);
  });

  test("round trips: linear ↔ OKLab ↔ OKLCH", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 500; i++) {
      const c: Vec3 = [rnd(), rnd(), rnd()];
      const back = oklabToLinear(linearToOklab(c));
      c.forEach((v, k) => expect(close(v, back[k], 1e-5)).toBe(true));
      const lab = linearToOklab(c);
      const lab2 = oklchToOklab(oklabToOklch(lab));
      lab.forEach((v, k) => expect(close(v, lab2[k], 1e-9)).toBe(true));
    }
  });

  test("hex parsing and sRGB transfer", () => {
    expect(rgbToHex(hexToRgb("#0a84ff"))).toBe("#0A84FF");
    expect(rgbToHex(hexToRgb("fff"))).toBe("#FFFFFF");
    expect(rgbToHex(hexToRgb("nope"))).toBe("#808080");
    expect(close(srgbToLinear([0.5, 0.5, 0.5])[0], 0.21404, 1e-4)).toBe(true);
  });

  test("gamut mapping keeps colours inside sRGB", () => {
    for (let h = 0; h < 360; h += 15) {
      const c = gamutMapOklch([0.7, 0.4, h]);
      expect(c.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });

  test("blending: midpoints differ by space; OKLCH takes the short way round the hue wheel", () => {
    const a = hexToRgb("#FF0000");
    const b = hexToRgb("#0000FF");
    const srgb = mixIn("srgb", a, b, 0.5);
    const lin = mixIn("linear", a, b, 0.5);
    expect(lin[0]).toBeGreaterThan(srgb[0]); // linear-light midpoints are brighter
    const h = srgbToOklch(mixIn("oklch", a, b, 0.5))[2];
    expect(h > 300 || h < 30).toBe(true); // through magenta, not green
    expect(mixIn("oklab", a, b, 0)).toEqual(a.map((v) => Math.round(v * 1e6) / 1e6) as Vec3);
  });

  test("gradient LUT honours ends, sharpness and bias", () => {
    const stops = evenStops(["#000000", "#FFFFFF"]);
    const lut = buildLut(stops, { space: "srgb", bias: 0, sharpness: 0 });
    expect(lut.length).toBe(LUT_SIZE * 4);
    expect(lut[0]).toBe(0);
    expect(lut[(LUT_SIZE - 1) * 4]).toBe(255);
    const hard = buildLut(stops, { space: "srgb", bias: 0, sharpness: 1 });
    expect(hard[64 * 4]).toBeLessThan(5); // a quarter of the way: still the first colour
    const biased = sampleGradient(stops, 0.5, { space: "srgb", bias: 1, sharpness: 0 });
    const neutral = sampleGradient(stops, 0.5, { space: "srgb", bias: 0, sharpness: 0 });
    expect(biased[0]).toBeGreaterThan(neutral[0]);
  });

  test("harmonies, hex lists and contrast", () => {
    for (const k of ["analogous", "triad", "complementary", "split", "mono"] as const) {
      const p = harmony("#7C3AED", k, 5);
      expect(p.length).toBe(5);
      // Dark → light.
      expect(srgbToOklab(hexToRgb(p[0]))[0]).toBeLessThan(srgbToOklab(hexToRgb(p[4]))[0]);
    }
    expect(parseHexList("#fff, 0a84ff and #123456; junk")).toEqual(["#FFFFFF", "#0A84FF", "#123456"]);
    expect(close(contrast("#000000", "#FFFFFF"), 21, 0.01)).toBe(true);
  });

  test("palette extraction finds the colours of a picture", () => {
    const cols = [[200, 30, 40], [20, 60, 200], [240, 220, 60]];
    const px = new Uint8ClampedArray(3000 * 4);
    for (let i = 0; i < 3000; i++) {
      const c = cols[i % 3];
      px.set([c[0], c[1], c[2], 255], i * 4);
    }
    const pal = extractPalette(px, 3);
    expect(pal.length).toBe(3);
    for (const c of cols) {
      const hex = rgbToHex([c[0] / 255, c[1] / 255, c[2] / 255]);
      expect(pal.some((p) => contrast(p, hex) < 1.05)).toBe(true);
    }
    expect(extractPalette(new Uint8ClampedArray(16), 3)).toEqual([]); // fully transparent
  });

  test("layer blend modes (CPU reference of the shader)", () => {
    const a: Vec3 = [0.2, 0.5, 0.8];
    const b: Vec3 = [0.6, 0.6, 0.6];
    expect(blendColors(a, b, "normal")).toEqual(b);
    const sc = blendColors(a, b, "screen");
    sc.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(Math.max(a[i], b[i]) - 1e-9));
    expect(blendColors(a, b, "overlay", 0)).toEqual(a);
    const soft = blendColors([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], "soft-light");
    soft.forEach((v) => expect(close(v, 0.5, 1e-9)).toBe(true));
  });
});

describe("state", () => {
  test("normalise never trusts input", () => {
    const s = normaliseState({ mode: "rm -rf", speed: 99, grain: -4, stops: ["#zz", 5, { color: "#123" }], tone: "x", layer: { look: {}, blend: "evil" }, name: "<script>hi</script>" });
    expect(s.mode).toBe("mesh");
    expect(s.speed).toBe(RANGES.speed[1]);
    expect(s.grain).toBe(0);
    expect(s.stops.length).toBeGreaterThanOrEqual(2);
    expect(s.tone).toBe("none");
    expect(s.layer?.blend).toBe("screen");
    expect(s.name).not.toContain("<");
  });

  test("share codes, links and .lensbg round-trip every preset", () => {
    for (const p of allPresets()) {
      const code = encodeState(p.state);
      expect(code.length).toBeLessThan(1500);
      expect(encodeState(decodeState(code)!)).toBe(code);
      expect(encodeState(decodeState(shareLink(p.state))!)).toBe(code);
      expect(encodeState(fromLensBg(toLensBg(p.state))!)).toBe(code);
    }
    expect(decodeState("LBG1.%%%")).toBeNull();
    expect(decodeState("hello")).toBeNull();
    expect(decodeState("LBG1." + "A".repeat(5000))).toBeNull();
    expect(fromLensBg("{\"lensbg\":2}")).toBeNull();
  });

  test("CSS fallback lists every stop", () => {
    const s = PRESETS[0].state;
    const css = cssGradient(s);
    for (const st of s.stops) expect(css).toContain(st.color);
  });
});

describe("looks", () => {
  test("at least 29 original looks, each with a blurb, sane params and handles", () => {
    expect(MODES.length).toBeGreaterThanOrEqual(29);
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
    for (const m of MODES) {
      expect(m.blurb.length).toBeGreaterThan(20);
      for (const p of m.params) expect(p.default >= p.min && p.default <= p.max).toBe(true);
      for (const h of m.handles) expect(h.default.x >= 0 && h.default.x <= 1 && h.default.y >= 0 && h.default.y <= 1).toBe(true);
      expect(m.glsl).toContain("vec3 look(vec2 p, vec2 uv)");
    }
  });

  test("the requested look categories exist", () => {
    const ids = new Set(MODES.map((m) => m.id));
    for (const id of ["beam", "halftone", "curtains", "window", "sea", "shards", "pixelscape", "tunnel", "edgeglow", "streaks", "tiles", "planet", "mesh", "bands", "plasma", "rays", "caustics", "marble", "cells", "glass", "bokeh", "eclipse", "horizon", "prism", "smoke", "kaleido"]) {
      expect(ids.has(id as never)).toBe(true);
    }
    expect(MODES.find((m) => m.id === "beam")!.ring).toBe(true);
    expect(MODES.find((m) => m.id === "tiles")!.handles.length).toBe(1);
  });

  test("loop safety: looks only use whole multiples of the phase", () => {
    for (const m of MODES) {
      // uPhase * <literal>: the literal must be a whole number.
      for (const match of m.glsl.matchAll(/uPhase\s*\*\s*([0-9.]+)(?![0-9.]*\s*\/)/g)) {
        expect(Number(match[1]) % 1).toBe(0);
      }
      // No free-running clock anywhere.
      expect(/uTime|iTime/.test(m.glsl)).toBe(false);
      // Periodic-x noise shifts must be scaled by the same period.
      for (const match of m.glsl.matchAll(/gnoiseP\([^;]*?,\s*(\d+)\)/g)) expect(Number(match[1])).toBeGreaterThan(0);
    }
  });
});

describe("presets", () => {
  test("40+ original presets plus one per built-in pack, all valid and unique", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(40);
    const all = allPresets();
    expect(all.length).toBe(PRESETS.length + PACK_SOURCES.length);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
    for (const p of all) expect(encodeState(normaliseState(p.state))).toBe(encodeState(p.state));
    // Every look is used by at least one preset except the photo looks (they need your picture).
    const used = new Set(PRESETS.map((p) => p.state.mode));
    for (const m of MODES) if (!m.image) expect(used.has(m.id) || m.id === "photomap").toBe(true);
  });

  test("pack presets stay in step with the theme packs", () => {
    for (const src of PACK_SOURCES) {
      const pack = THEME_PACKS.find((p) => p.id === src.id);
      expect(pack).toBeDefined();
      expect((pack!.base ?? "#09090B").toUpperCase()).toBe(src.base.toUpperCase());
      expect(pack!.accent.toUpperCase()).toBe(src.accent.toUpperCase());
    }
  });
});

describe("time", () => {
  test("phase wraps exactly at the loop", () => {
    expect(phaseAt(0, 20)).toBe(0);
    expect(close(phaseAt(20, 20), 0)).toBe(true);
    expect(close(phaseAt(5, 20), Math.PI / 2)).toBe(true);
    expect(phaseAt(-5, 20)).toBeGreaterThan(0);
  });

  test("export frame times: fps × seconds frames, the last one before the loop point", () => {
    const t = exportFrameTimes(20, 30);
    expect(t.length).toBe(600);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeLessThan(20);
    expect(close(t[t.length - 1] + 1 / 30, 20, 1e-9)).toBe(true);
  });

  test("the clock follows the wall clock, caps gaps and resumes where it paused", () => {
    let now = 0;
    const c = new LoopClock(20, 0.25, () => now);
    c.tick();
    now = 100;
    expect(close(c.tick(), 0.1)).toBe(true);
    now = 10_100; // ten-second stall (sleep, hidden window)
    expect(close(c.tick(), 0.35)).toBe(true);
    c.setPaused(true);
    now = 20_000;
    expect(close(c.tick(), 0.35)).toBe(true);
    c.setPaused(false);
    c.tick();
    now = 20_033;
    expect(close(c.tick(), 0.383)).toBe(true);
  });
});

describe("inspire and words", () => {
  const base = defaultState("mesh");
  test("Inspire is deterministic and respects locks", () => {
    const a = inspire(base, undefined, new Set(), 42);
    const b = inspire(base, undefined, new Set(), 42);
    expect(encodeState(a)).toBe(encodeState(b));
    const locked = inspire(base, undefined, new Set(["palette", "mode"]), 7);
    expect(locked.mode).toBe(base.mode);
    expect(locked.stops).toEqual(base.stops);
  });

  test("mood steers motion", () => {
    const calm = inspire(base, { energy: 0, warmth: 0.5, richness: 0.5 }, new Set(), 5);
    const wild = inspire(base, { energy: 1, warmth: 0.5, richness: 0.5 }, new Set(), 5);
    expect(wild.speed).toBeGreaterThan(calm.speed);
  });

  test("“make me a calm blue aurora backdrop”", () => {
    const r = promptToState("Lens, make me a calm blue aurora backdrop", base, 3);
    expect(r.state.mode).toBe("curtains");
    expect(r.state.speed).toBeLessThan(0.2);
    const hues = r.state.stops.map((s) => srgbToOklch(hexToRgb(s.color))).filter((c) => c[1] > 0.04).map((c) => c[2]);
    expect(hues.every((h) => h > 200 && h < 300)).toBe(true);
    expect(r.understood).toContain("Curtains");
  });

  test("“slower and more purple” adjusts instead of replacing", () => {
    const s = { ...base, speed: 0.4, stops: evenStops(["#001020", "#0050A0", "#40A0FF"]) };
    const r = adjustState(s, "make it slower and more purple");
    expect(r.state.mode).toBe(s.mode);
    expect(r.state.speed).toBeLessThan(0.4);
    expect(r.changes).toContain("more purple");
    const before = srgbToOklch(hexToRgb(s.stops[2].color))[2];
    const after = srgbToOklch(hexToRgb(r.state.stops[2].color))[2];
    expect(Math.abs(after - 300)).toBeLessThan(Math.abs(before - 300));
  });
});

describe("living wallpaper", () => {
  const a = PRESETS.find((p) => p.id === "soft-lagoon")!.state;
  const b = PRESETS.find((p) => p.id === "soft-peach-mist")!.state;

  test("interpolation hits both ends and stays valid in between", () => {
    expect(interpolateStates(a, b, 0).stops.map((s) => s.color)).toEqual(a.stops.map((s) => s.color));
    expect(interpolateStates(a, b, 1).stops.map((s) => s.color)).toEqual(b.stops.map((s) => s.color));
    const mid = interpolateStates(a, b, 0.5);
    expect(mid.speed).toBeCloseTo((a.speed + b.speed) / 2, 6);
  });

  test("time-of-day keyframes hold, then ease into the next", () => {
    const keys = { morning: a, evening: b };
    expect(keyframeBlend(keys, 7)!.t).toBe(0);
    expect(keyframeBlend(keys, 9)!.a).toBe(a);
    const late = keyframeBlend(keys, 17)!;
    expect(late.a).toBe(a);
    expect(late.b).toBe(b);
    expect(late.t).toBeGreaterThan(0);
    expect(keyframeBlend(keys, 3)!.a).toBe(b); // night wraps to evening's slot
    expect(keyframeState({}, 12)).toBeNull();
  });

  test("playlist timing", () => {
    const start = 1_000_000;
    expect(playlistIndex(start, start, 15, 4)).toBe(0);
    expect(playlistIndex(start, start + 15 * 60_000, 15, 4)).toBe(1);
    expect(playlistIndex(start, start + 4 * 15 * 60_000, 15, 4)).toBe(0);
    expect(playlistNextIn(start, start + 60_000, 15)).toBe(14 * 60_000);
    expect(playlistIndex(start, start, 15, 0)).toBe(-1);
  });

  test("evolve never leaves its range, even after a week", () => {
    for (let m = 0; m < 60 * 24 * 7; m += 37) {
      const e = evolve(a, m, 0.5, 3);
      for (const k of ["warp", "speed", "softness", "scale", "saturation", "contrast"] as const) {
        const [lo, hi] = evolveBounds(a, k, 0.5);
        expect(e[k]).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(e[k]).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
    expect(encodeState(evolve(a, 10, 0))).toBe(encodeState(normaliseState(a)));
  });

  test("reactions are gentle and bounded", () => {
    const busy = applyReactions(a, { cpu: 1 });
    const h0 = srgbToOklch(hexToRgb(a.stops[2].color))[2];
    const h1 = srgbToOklch(hexToRgb(busy.stops[2].color))[2];
    expect(Math.abs(((h1 - h0 + 540) % 360) - 180)).toBeLessThanOrEqual(10.5);
    expect(applyReactions(a, { focus: true }).speed).toBeCloseTo(a.speed * 0.5, 6);
    const night = applyReactions(a, { sun: -1 });
    expect(night.exposure).toBeLessThan(a.exposure);
    expect(applyReactions(a, { album: ["#111111", "#AA3355", "#FFEEDD"] }).stops.length).toBe(3);
  });
});

describe("make a theme", () => {
  test("every preset gives a readable, valid custom pack", () => {
    for (const p of allPresets()) {
      const { pack, report } = backdropToPack(p.state, p.name);
      expect(report.text).toBeGreaterThanOrEqual(4.5);
      expect(report.accent).toBeGreaterThanOrEqual(3);
      expect(validateCustomPack({ ...pack, id: pack.label })).not.toBeNull();
    }
  });
});

describe("wallpaper scene", () => {
  test("scene options keep the backdrop code and resolve it", async () => {
    const { backdropScene, resolveBackdrop, BACKDROP_CARD_PRESETS } = await import("../studio/backdrop/scene");
    const s: BackdropState = PRESETS.find((p) => p.id === "nature-moon-sea")!.state;
    const opts = normaliseOptions(backdropScene, { preset: "custom", code: encodeState(s) });
    expect(encodeState(resolveBackdrop(opts, null))).toBe(encodeState(s));
    // Unknown preset → hero; oversized code dropped.
    expect(resolveBackdrop(normaliseOptions(backdropScene, { preset: "nope" }), null).mode).toBe("nebula");
    expect(normaliseOptions(backdropScene, { preset: "custom", code: "x".repeat(9000) }).code).toBe("");
    // Follow theme: colours from the pack palette.
    const pal = { accent: { r: 255, g: 121, b: 198 }, base: { r: 40, g: 42, b: 54 }, elevated: { r: 60, g: 60, b: 70 }, fg: { r: 250, g: 250, b: 250 }, dark: true };
    const f = resolveBackdrop(normaliseOptions(backdropScene, { preset: "lens-nebula", followTheme: true }), pal);
    expect(f.stops[0].color).toBe("#282A36");
    for (const id of BACKDROP_CARD_PRESETS) expect(allPresets().some((p) => p.id === id)).toBe(true);
    // The whole options object stays far below the wallpaper's 32 KB cap.
    expect(JSON.stringify(opts).length).toBeLessThan(2000);
  });
});
