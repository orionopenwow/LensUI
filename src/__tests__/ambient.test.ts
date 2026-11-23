import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Palette } from "../playground/types";
import {
  MAX_STRENGTH,
  bufferSize,
  coloursFrom,
  makeInk,
  withDefaults,
  lumRange,
  motionTuning,
  renderFrame,
  type AmbientScene,
} from "../playground/ambient/core";
import { AMBIENT_SCENES, ambientSceneById } from "../playground/ambient/scenes";
import { PACK_AMBIENT, ambientFor } from "../playground/ambient/packMap";
import { resolveAmbient } from "../playground/ambient/module";
import { isAmbientOn, withAmbient, ambientOptionsOf } from "../playground/ambient/settings";
import { THEME_PACKS } from "../themes/packs";
import type { WallpaperSettings } from "../surfaces/wallpaperTypes";

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const pal = (base: string, accent: string, dark: boolean, fg = dark ? "#FAFAFA" : "#09090B", elevated = dark ? "#18181B" : "#FFFFFF"): Palette => ({
  base: rgb(base),
  accent: rgb(accent),
  fg: rgb(fg),
  elevated: rgb(elevated),
  dark,
});

/** Extreme and real palettes: luminance must stay bounded on every one. */
const PALETTES: [string, Palette][] = [
  ["obsidian", pal("#09090B", "#FAFAFA", true)],
  ["black-yellow", pal("#000000", "#FCEE0A", true, "#FFFFFF", "#202020")],
  ["tokyo", pal("#1A1B26", "#7AA2F7", true)],
  ["nord", pal("#2E3440", "#88C0D0", true)],
  ["alabaster", pal("#EEEEF0", "#2563EB", false)],
  ["paper", pal("#F5F1E8", "#C2410C", false)],
  ["white-black", pal("#FFFFFF", "#000000", false, "#000000", "#FFFFFF")],
];

const W = 160;
const H = 90;

describe("ambient backdrops", () => {
  test("at least ten scenes, each with a 20–90 s cycle", () => {
    expect(AMBIENT_SCENES.length).toBeGreaterThanOrEqual(10);
    for (const s of AMBIENT_SCENES) {
      expect(s.cycle).toBeGreaterThanOrEqual(20);
      expect(s.cycle).toBeLessThanOrEqual(90);
    }
    expect(new Set(AMBIENT_SCENES.map((s) => s.id)).size).toBe(AMBIENT_SCENES.length);
  });

  test("every built-in pack has a backdrop, and every mapping names a real scene", () => {
    for (const p of THEME_PACKS) {
      const choice = p.ambient ?? PACK_AMBIENT[p.id];
      expect(choice, p.id).toBeDefined();
      expect(ambientSceneById(choice!.scene), `${p.id} -> ${choice!.scene}`).not.toBeNull();
    }
    for (const [id, c] of Object.entries(PACK_AMBIENT)) expect(ambientSceneById(c.scene), `${id} -> ${c.scene}`).not.toBeNull();
    // Unknown packs fall back by mood.
    expect(ambientFor("not-a-pack", true).scene).toBe("waves");
    expect(ambientFor("not-a-pack", false).scene).toBe("paper");
    expect(ambientFor("obsidian", true).scene).toBe("waves");
  });

  test("an override uses neutral params; auto uses the pack's tuning", () => {
    expect(resolveAmbient("auto", "sequoia-frost", true).params?.saturation).toBe(0.35);
    const o = resolveAmbient("plotter", "sequoia-frost", true);
    expect(o.scene.id).toBe("plotter");
    expect(o.params).toBeUndefined();
    expect(resolveAmbient("no-such-scene", "tokyo-night", true).scene.id).toBe("contours");
  });

  test("scene colours come only from theme tokens (no fixed hex or rgb literals)", () => {
    const dir = join(import.meta.dir, "../playground/ambient/scenes");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), `${f} has a hex colour`).toBe(false);
      expect(/rgba?\(/.test(src), `${f} has an rgb() colour`).toBe(false);
    }
  });

  test("frames are deterministic for a seed", () => {
    for (const s of AMBIENT_SCENES) {
      const a = renderFrame(s, W, H, 12.5, PALETTES[0][1], { seed: 42 }).buf;
      const b = renderFrame(s, W, H, 12.5, PALETTES[0][1], { seed: 42 }).buf;
      expect(Buffer.from(a).equals(Buffer.from(b)), s.id).toBe(true);
    }
  });

  test("Still holds a single frame; Subtle and Lively move slowly", () => {
    expect(motionTuning("still", true).speed).toBe(0);
    expect(motionTuning("subtle", true).speed).toBe(1);
    expect(motionTuning("lively", false).speed).toBeLessThanOrEqual(2);
    for (const m of ["still", "subtle", "lively"] as const)
      for (const d of [true, false]) expect(motionTuning(m, d).strength).toBeLessThanOrEqual(MAX_STRENGTH);
  });

  test("luminance across any frame stays within 10 % on every palette", () => {
    for (const s of AMBIENT_SCENES) {
      for (const [name, p] of PALETTES) {
        let state: unknown;
        for (let i = 0; i < 6; i++) {
          const t = (s.cycle * i) / 6;
          const r = renderFrame(s, W, H, t, p, { seed: 3, motion: "lively", params: { amount: 1.3 }, state });
          state = r.state;
          const range = lumRange(r.buf);
          expect(range, `${s.id} on ${name} at t=${t.toFixed(1)}`).toBeLessThanOrEqual(0.1);
        }
      }
    }
  });

  test("frames actually change over time (it's animated), but only a little per second", () => {
    for (const s of AMBIENT_SCENES) {
      const p = PALETTES[0][1];
      const a = renderFrame(s, W, H, 10, p, { seed: 5 });
      const b = renderFrame(s, W, H, 10 + s.cycle / 4, p, { seed: 5, state: a.state });
      let diff = 0;
      for (let i = 0; i < a.buf.length; i++) diff += Math.abs(a.buf[i] - b.buf[i]);
      expect(diff, `${s.id} is static`).toBeGreaterThan(0);
    }
  });

  test("paint cost at 1080p stays under 3 ms per frame (median of batches)", () => {
    const report: Record<string, number> = {};
    const p = PALETTES[0][1];
    const ink = makeInk(coloursFrom(p), motionTuning("lively", true).strength);
    const params = withDefaults(undefined);
    for (const s of AMBIENT_SCENES as AmbientScene[]) {
      const { w, h } = bufferSize(1920, 1080, s.scale);
      // Reuse one buffer and the scene state, like the runner does.
      const buf = new Uint8ClampedArray(w * h * 4);
      const st = s.painter.init(w, h, 1, true);
      let t = 0;
      const frame = () => s.painter.paint({ buf, w, h, t: (t += 1 / 24), ink, params, dark: true }, st);
      for (let i = 0; i < 20; i++) frame(); // warm up the JIT
      const batches: number[] = [];
      for (let b = 0; b < 7; b++) {
        const t0 = performance.now();
        for (let i = 0; i < 12; i++) frame();
        batches.push((performance.now() - t0) / 12);
      }
      batches.sort((a, b) => a - b);
      const ms = batches[3];
      report[s.id] = Math.round(ms * 100) / 100;
      expect(ms, `${s.id} ${w}×${h}`).toBeLessThan(3);
    }
    console.log("ambient paint ms/frame @1080p:", JSON.stringify(report));
  });

  test("turning the backdrop on and off restores the previous wallpaper", () => {
    const s0 = { enabled: true, scene: "sand", sceneOptions: {}, interactive: true } as unknown as WallpaperSettings;
    const on = withAmbient(s0, true);
    expect(isAmbientOn(on)).toBe(true);
    expect(on.interactive).toBe(false);
    expect(ambientOptionsOf(on).motion).toBe("subtle");
    const lively = withAmbient(on, true, { motion: "lively" });
    expect(ambientOptionsOf(lively).motion).toBe("lively");
    const off = withAmbient(lively, false);
    expect(off.scene).toBe("sand");
    expect(off.enabled).toBe(true);
    const fresh = { enabled: false, scene: "", sceneOptions: {} } as unknown as WallpaperSettings;
    const back = withAmbient(withAmbient(fresh, true), false);
    expect(back.enabled).toBe(false);
    expect(back.scene).toBe("");
  });
});
