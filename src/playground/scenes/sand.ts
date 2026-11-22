import type { InputState, Palette, RGB, SceneContext, SceneInstance, SceneModule, SceneOptions } from "../types";
import { normaliseOptions } from "../types";
import { GridBlitter } from "../gl";
import { clamp, hslToRgb, mix, rgbToHsl, shift } from "../util";
import { EMPTY, FIRE, MATERIAL_COUNT, PLANT, SAND, SMOKE, SandSim, STONE, WATER } from "./sandSim";

const MATERIALS: { id: string; label: string; m: number }[] = [
  { id: "sand", label: "Sand", m: SAND },
  { id: "water", label: "Water", m: WATER },
  { id: "stone", label: "Stone", m: STONE },
  { id: "fire", label: "Fire", m: FIRE },
  { id: "smoke", label: "Smoke", m: SMOKE },
  { id: "plant", label: "Vine", m: PLANT },
  { id: "eraser", label: "Eraser", m: EMPTY },
];

/** Material colours from the theme: sand leans warm, water takes the accent, vines go green. */
function materialColours(p: Palette): RGB[] {
  const [ah, as] = rgbToHsl(p.accent);
  const grey = as < 0.12;
  const out: RGB[] = new Array(MATERIAL_COUNT);
  out[EMPTY] = p.base;
  out[SAND] = hslToRgb(grey ? 38 : ah + (((38 - ah + 540) % 360) - 180) * 0.75, 0.62, p.dark ? 0.62 : 0.55);
  out[WATER] = hslToRgb(grey ? 208 : ah, grey ? 0.6 : Math.max(0.5, as), p.dark ? 0.52 : 0.5);
  out[STONE] = mix(p.elevated, p.fg, p.dark ? 0.32 : 0.42);
  out[FIRE] = { r: 255, g: 140, b: 40 };
  out[SMOKE] = mix(p.base, p.fg, 0.45);
  out[PLANT] = hslToRgb(grey ? 135 : ah + (((135 - ah + 540) % 360) - 180) * 0.7, 0.5, p.dark ? 0.45 : 0.4);
  return out;
}

export const sandScene: SceneModule = {
  id: "sand",
  name: "Falling Sand",
  blurb: "Paint sand, water, stone, fire and vines on your desktop; they fall, flow, burn and grow.",
  interactive: true,
  warmup: 0,
  settings: [
    { key: "material", label: "Material", type: "choice", options: MATERIALS.map(({ id, label }) => ({ id, label })), default: "sand" },
    { key: "brush", label: "Brush", type: "range", min: 1, max: 14, step: 1, default: 4 },
    {
      key: "paintWith",
      label: "Paint with",
      type: "choice",
      options: [
        { id: "left", label: "Left button" },
        { id: "alt", label: "Alt + left" },
        { id: "middle", label: "Middle button" },
      ],
      default: "left",
    },
    { key: "grain", label: "Grain", type: "choice", options: [{ id: "3", label: "Fine" }, { id: "4", label: "Classic" }, { id: "6", label: "Chunky" }], default: "4" },
    { key: "speed", label: "Gravity", type: "range", min: 1, max: 3, step: 1, default: 2 },
    { key: "drizzle", label: "Drizzle", type: "choice", options: [{ id: "off", label: "Off" }, { id: "sand", label: "Sand" }, { id: "water", label: "Water" }], default: "off" },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(sandScene, ctx.options);
    let palette = ctx.palette;
    let colours = materialColours(palette);
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const blitter = new GridBlitter(ctx.canvas);
    // Gallery thumbnails use finer grains so the little scene still reads.
    const grainPx = () => (ctx.preview ? 2 : Number(opts.grain) || 4);
    let cellPx = grainPx();
    let sim: SandSim;
    let rgba: Uint8Array;
    let bg: Uint8Array;
    let lastPaint: { x: number; y: number } | null = null;
    let brushBoost = 0;

    const buildBg = () => {
      const { w, h } = sim;
      bg = new Uint8Array(w * h * 3);
      const top = mix(palette.base, palette.elevated, palette.dark ? 0.55 : 0.2);
      const glow = shift(palette.accent, 0, 0.8, palette.dark ? 0.35 : 0.85);
      for (let y = 0; y < h; y++) {
        const ty = y / (h - 1);
        const row = mix(top, palette.base, Math.pow(ty, 0.8));
        for (let x = 0; x < w; x++) {
          const dx = (x / w - 0.5) * 1.6, dy = 1 - ty;
          const g = Math.exp(-(dx * dx + dy * dy * 6)) * (palette.dark ? 0.22 : 0.18);
          const c = mix(row, glow, g);
          const k = (y * w + x) * 3;
          bg[k] = c.r;
          bg[k + 1] = c.g;
          bg[k + 2] = c.b;
        }
      }
    };

    const setup = (keep?: Uint8Array | null) => {
      const gw = Math.max(16, Math.round(width / cellPx));
      const gh = Math.max(16, Math.round(height / cellPx));
      sim = new SandSim(gw, gh, ctx.seed);
      rgba = new Uint8Array(gw * gh * 4);
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      blitter.resizeGrid(gw, gh);
      buildBg();
      if (keep) sim.load(keep);
    };
    setup();
    demo();

    /** A small starting landscape (dunes, a ledge, a pool, vines) so the scene is never blank. */
    function demo() {
      const { w, h } = sim;
      for (let x = 0; x < w; x++) {
        const dune = Math.round(h * (0.08 + 0.06 * Math.sin(x / w * 5.3 + 0.6) + 0.04 * Math.sin(x / w * 13)));
        for (let y = h - dune; y < h; y++) sim.set(x, y, SAND);
      }
      const lx0 = Math.round(w * 0.6), lx1 = Math.round(w * 0.86), ly = Math.round(h * 0.55);
      for (let x = lx0; x <= lx1; x++) for (let t = 0; t < 2; t++) sim.set(x, ly + t, STONE);
      for (let y = ly - Math.round(h * 0.08); y < ly; y++) for (let t = 0; t < 2; t++) {
        sim.set(lx0 + t, y, STONE);
        sim.set(lx1 - t, y, STONE);
      }
      for (let x = lx0 + 2; x < lx1 - 1; x++) for (let y = ly - Math.round(h * 0.05); y < ly; y++) sim.set(x, y, WATER);
      for (let x = Math.round(w * 0.12); x < Math.round(w * 0.3); x++) if (x % 3) sim.set(x, h - Math.round(h * 0.16) - 1, PLANT);
    }

    const toGrid = (x: number, y: number) => ({
      x: clamp(Math.floor((x / width) * sim.w), 0, sim.w - 1),
      y: clamp(Math.floor((y / height) * sim.h), 0, sim.h - 1),
    });

    const currentMaterial = () => MATERIALS.find((m) => m.id === opts.material)?.m ?? SAND;

    const inst: SceneInstance = {
      dirty: false,
      step(_dt: number, input: InputState) {
        // Wheel adjusts the brush for this session.
        for (const e of input.events) if (e.kind === "wheel") brushBoost = clamp(brushBoost + Math.sign(e.delta), -6, 10);
        const mode = String(opts.paintWith);
        const r = clamp(Number(opts.brush) + brushBoost, 1, 24);
        const brushAt = (x: number, y: number, buttons: number, alt: boolean) => {
          const painting =
            (mode === "left" && (buttons & 1) !== 0) ||
            (mode === "alt" && (buttons & 1) !== 0 && alt) ||
            (mode === "middle" && (buttons & 4) !== 0);
          const erasing = (buttons & 2) !== 0;
          if (!painting && !erasing) {
            lastPaint = null;
            return;
          }
          const m = erasing ? EMPTY : currentMaterial();
          const loose = m === SAND || m === WATER || m === FIRE || m === SMOKE;
          const g = toGrid(x, y);
          const from = lastPaint ?? g;
          sim.paintLine(from.x, from.y, g.x, g.y, r, m, loose ? 0.55 : 1);
          lastPaint = g;
          inst.dirty = true;
        };
        // Replay events in order, so separate strokes within one frame never get joined.
        for (const e of input.events) {
          if (e.kind === "leave" || e.kind === "up") lastPaint = null;
          else if (e.kind === "move" || e.kind === "down") brushAt(e.x, e.y, e.buttons, e.alt);
        }
        // Holding still keeps pouring.
        if (input.events.length === 0 && input.inside && input.buttons) brushAt(input.x, input.y, input.buttons, input.alt);
        const d = String(opts.drizzle);
        if (d !== "off") {
          const m = d === "water" ? WATER : SAND;
          for (let k = 0; k < Math.max(1, sim.w / 160); k++) {
            const x = (sim.rng() * sim.w) | 0;
            if (sim.get(x, 0) === EMPTY && sim.rng() < 0.6) sim.set(x, 0, m);
          }
        }
        const n = clamp(Number(opts.speed) | 0, 1, 3);
        for (let s = 0; s < n; s++) sim.step();
      },
      render() {
        const { w, h, cell, life, shade } = sim;
        const t = sim.tick;
        for (let i = 0, n = w * h; i < n; i++) {
          const m = cell[i];
          const o = i * 4;
          const b = i * 3;
          if (m === EMPTY) {
            rgba[o] = bg[b];
            rgba[o + 1] = bg[b + 1];
            rgba[o + 2] = bg[b + 2];
          } else if (m === FIRE) {
            const l = life[i] / 64;
            const flick = ((shade[i] + t * 37) & 63) / 63;
            rgba[o] = 255;
            rgba[o + 1] = clamp(90 + l * 150 + flick * 40, 0, 255);
            rgba[o + 2] = clamp(20 + l * l * 120, 0, 255);
          } else if (m === SMOKE) {
            const a = Math.min(1, life[i] / 90) * 0.55;
            const c = colours[SMOKE];
            rgba[o] = bg[b] + (c.r - bg[b]) * a;
            rgba[o + 1] = bg[b + 1] + (c.g - bg[b + 1]) * a;
            rgba[o + 2] = bg[b + 2] + (c.b - bg[b + 2]) * a;
          } else {
            const c = colours[m];
            let k = 0.86 + (shade[i] / 255) * 0.26;
            if (m === WATER) k = 0.9 + ((((shade[i] + t * 3) & 255) / 255) * 0.18);
            rgba[o] = c.r * k;
            rgba[o + 1] = c.g * k;
            rgba[o + 2] = c.b * k;
          }
          rgba[o + 3] = 255;
        }
        blitter.draw(rgba);
      },
      resize(w2, h2, d2) {
        width = w2;
        height = h2;
        dpr = d2;
        setup(sim.serialize());
      },
      setPalette(p) {
        palette = p;
        colours = materialColours(p);
        buildBg();
      },
      setOptions(o: SceneOptions) {
        const next = normaliseOptions(sandScene, o);
        const grainChanged = next.grain !== opts.grain;
        opts = next;
        if (grainChanged) {
          cellPx = grainPx();
          setup(sim.serialize());
        }
      },
      save: () => sim.serialize(),
      load: (bytes) => {
        sim.load(bytes);
      },
      reset() {
        sim.clear();
      },
      dispose() {
        blitter.dispose();
      },
    };
    return inst;
  },
};

