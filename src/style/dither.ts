// Lens dither: an ordered (Bayer 8×8) halftone texture over soft low-frequency "clouds", drawn
// from theme tokens. A presentation material for backdrops and empty states, never behind body
// text.
//
//   import { installDither } from "../style/dither";
//   import "../style/dither.css";
//   installDither();                  // once per surface; follows --lens-dither / --lens-grain / --lens-fg
//   <div className="lens-dither">…</div>
//
// Controls: --lens-dither (0–1) is how much texture there is (0 turns it off); --lens-grain (0–1)
// adds fine random speckle. High-contrast modes turn it off; it never animates under reduced motion.

export interface DitherOptions {
  /** 0–100. 0 = off. */
  dither: number;
  /** 0–100. */
  grain: number;
  /** Dot colour (any CSS colour the canvas understands); defaults to the theme's --lens-fg. */
  color?: string;
  /** Size of one dither cell in CSS px. */
  cell?: number;
  /** Tile size in cells (the texture repeats seamlessly). */
  tile?: number;
  seed?: number;
}

/** Bayer threshold matrix of size 2^k, values in [0, 1). */
export function bayer(size = 8): number[][] {
  let m = [[0]];
  while (m.length < size) {
    const n = m.length;
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    m = next;
  }
  const total = size * size;
  return m.map((r) => r.map((v) => (v + 0.5) / total));
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise: a `period`-cell lattice that wraps, smoothstep-interpolated. */
function noiseLayer(w: number, period: number, rand: () => number): Float32Array {
  const lattice = Array.from({ length: period * period }, () => rand());
  const at = (x: number, y: number) => lattice[((y % period) + period) % period * period + (((x % period) + period) % period)];
  const out = new Float32Array(w * w);
  const step = period / w;
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const fx = x * step;
      const fy = y * step;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const sx = fx - x0;
      const sy = fy - y0;
      const u = sx * sx * (3 - 2 * sx);
      const v = sy * sy * (3 - 2 * sy);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * u;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * u;
      out[y * w + x] = a + (b - a) * v;
    }
  return out;
}

/** The dot mask for one tile (1 = dot), pure so it can be tested. Size is `tile × tile` cells. */
export function ditherMask(opts: DitherOptions): Uint8Array {
  const tile = Math.max(16, Math.min(256, Math.round(opts.tile ?? 128)));
  const d = Math.max(0, Math.min(100, opts.dither)) / 100;
  const g = Math.max(0, Math.min(100, opts.grain)) / 100;
  const out = new Uint8Array(tile * tile);
  if (d <= 0) return out;
  const rand = rng(opts.seed ?? 7);
  // Two octaves of clouds: broad shapes plus a little detail.
  const broad = noiseLayer(tile, 4, rand);
  const detail = noiseLayer(tile, 16, rand);
  const m = bayer(8);
  const speck = rng((opts.seed ?? 7) + 101);
  for (let y = 0; y < tile; y++)
    for (let x = 0; x < tile; x++) {
      const i = y * tile + x;
      // Contrast-shaped density: gaps stay clear, cloud cores fill in.
      let level = Math.pow(Math.max(0, broad[i] * 0.78 + detail[i] * 0.22 - (1 - d) * 0.55), 1.4) * (0.35 + d * 0.9);
      level += (speck() - 0.5) * g * 0.6;
      out[i] = level > m[y & 7][x & 7] ? 1 : 0;
    }
  return out;
}

/** Share of cells that are dots (for tests and for choosing dot opacity). */
export function coverage(mask: Uint8Array): number {
  let n = 0;
  for (const v of mask) n += v;
  return mask.length ? n / mask.length : 0;
}

const cache = new Map<string, string>();

/** Draws the tile and returns a PNG data URL (empty string when off or without a canvas). */
export function ditherDataUrl(opts: DitherOptions): string {
  const cell = Math.max(1, Math.min(8, Math.round(opts.cell ?? 3)));
  const tile = Math.max(16, Math.min(256, Math.round(opts.tile ?? 128)));
  const color = opts.color || "#fafafa";
  const key = `${opts.dither}|${opts.grain}|${color}|${cell}|${tile}|${opts.seed ?? 7}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (opts.dither <= 0 || typeof document === "undefined") return "";
  const mask = ditherMask({ ...opts, tile });
  const canvas = document.createElement("canvas");
  canvas.width = tile * cell;
  canvas.height = tile * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = color;
  // Low contrast: denser textures get fainter dots so the overall tone stays quiet.
  ctx.globalAlpha = Math.max(0.1, 0.32 - coverage(mask) * 0.25);
  const dot = Math.max(1, cell - 1);
  for (let y = 0; y < tile; y++)
    for (let x = 0; x < tile; x++) if (mask[y * tile + x]) ctx.fillRect(x * cell, y * cell, dot, dot);
  let url = "";
  try {
    url = canvas.toDataURL("image/png");
  } catch {
    url = "";
  }
  if (cache.size > 24) cache.clear();
  cache.set(key, url);
  return url;
}

/** True when the user asked for more contrast or forced colours: the texture stays off. */
export function highContrast(): boolean {
  if (typeof matchMedia === "undefined") return false;
  return matchMedia("(prefers-contrast: more)").matches || matchMedia("(forced-colors: active)").matches;
}

function readNumber(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const v = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

/** Paints `--lens-dither-img` on `target` from its tokens (or explicit options). */
export function applyDither(target: HTMLElement = document.documentElement, opts: Partial<DitherOptions> = {}): void {
  const cs = getComputedStyle(target);
  const dither = opts.dither ?? Math.round(readNumber(cs, "--lens-dither", 0.4) * 100);
  const grain = opts.grain ?? Math.round(readNumber(cs, "--lens-grain", 0.2) * 100);
  const color = opts.color ?? (cs.getPropertyValue("--lens-fg").trim() || "#fafafa");
  const cell = opts.cell ?? Math.round(readNumber(cs, "--lens-dither-cell", 3));
  const url = highContrast() ? "" : ditherDataUrl({ dither, grain, color, cell, tile: opts.tile, seed: opts.seed });
  target.style.setProperty("--lens-dither-img", url ? `url("${url}")` : "none");
  target.style.setProperty("--lens-dither-tile", `${(opts.tile ?? 128) * cell}px`);
}

/** Keeps the root texture in sync with the theme (token changes, contrast changes). */
export function installDither(root: HTMLElement = document.documentElement): () => void {
  let raf = 0;
  const run = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => applyDither(root));
  };
  run();
  let last = "";
  const obs = new MutationObserver(() => {
    const cs = getComputedStyle(root);
    const sig = ["--lens-dither", "--lens-grain", "--lens-fg"].map((n) => cs.getPropertyValue(n)).join("|") + root.dataset.scheme;
    if (sig !== last) {
      last = sig;
      run();
    }
  });
  obs.observe(root, { attributes: true, attributeFilter: ["style", "data-scheme", "class"] });
  const mqs = typeof matchMedia === "undefined" ? [] : ["(prefers-contrast: more)", "(forced-colors: active)"].map((q) => matchMedia(q));
  mqs.forEach((m) => m.addEventListener?.("change", run));
  return () => {
    obs.disconnect();
    mqs.forEach((m) => m.removeEventListener?.("change", run));
    cancelAnimationFrame(raf);
  };
}
