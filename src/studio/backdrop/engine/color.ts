/**
 * Backdrop Lab colour pipeline (framework-free; see docs/BACKDROP_LAB.md §Colour).
 *
 * Colours are stored as "#RRGGBB" strings. Gradients are baked on the CPU into a 256-entry
 * lookup table in the chosen blend space (sRGB, linear light, OKLab or OKLCH), then uploaded to
 * the GPU once per change. Shaders only ever produce a scalar position t ∈ [0, 1] plus a glow
 * term, so every look shares exactly the same colour maths, and tests can check it without a GPU.
 *
 * OKLab follows Björn Ottosson's published definition (public matrices).
 */

export type Vec3 = [number, number, number];
export type BlendSpace = "srgb" | "linear" | "oklab" | "oklch";

export const BLEND_SPACES: { id: BlendSpace; label: string }[] = [
  { id: "srgb", label: "sRGB" },
  { id: "linear", label: "Linear" },
  { id: "oklab", label: "OKLab" },
  { id: "oklch", label: "OKLCH" },
];

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const HEX_RE = /^#?([0-9a-f]{6})$/i;
const HEX3_RE = /^#?([0-9a-f]{3})$/i;

export function isHex(s: unknown): s is string {
  return typeof s === "string" && (HEX_RE.test(s.trim()) || HEX3_RE.test(s.trim()));
}

/** "#rrggbb" / "rrggbb" / "#rgb" → [0..1]³ sRGB. Invalid input → mid grey. */
export function hexToRgb(hex: string): Vec3 {
  const t = String(hex).trim();
  let m = HEX_RE.exec(t);
  let h = m?.[1];
  if (!h) {
    const s = HEX3_RE.exec(t)?.[1];
    h = s ? s.split("").map((c) => c + c).join("") : "808080";
  }
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(c: Vec3): string {
  const b = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${b(c[0])}${b(c[1])}${b(c[2])}`.toUpperCase();
}

export function normHex(s: string): string {
  return rgbToHex(hexToRgb(s));
}

// ── transfer functions ──────────────────────────────────────────────────────────────────────

export function srgbToLinear1(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb1(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return v;
}
export const srgbToLinear = (c: Vec3): Vec3 => [srgbToLinear1(c[0]), srgbToLinear1(c[1]), srgbToLinear1(c[2])];
export const linearToSrgb = (c: Vec3): Vec3 => [linearToSrgb1(c[0]), linearToSrgb1(c[1]), linearToSrgb1(c[2])];

// ── OKLab / OKLCH ───────────────────────────────────────────────────────────────────────────

export function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToOklch([L, a, b]: Vec3): Vec3 {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, C < 1e-6 ? 0 : h];
}

export function oklchToOklab([L, C, h]: Vec3): Vec3 {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

export const srgbToOklab = (c: Vec3) => linearToOklab(srgbToLinear(c));
export const oklabToSrgb = (c: Vec3) => linearToSrgb(oklabToLinear(c));
export const srgbToOklch = (c: Vec3) => oklabToOklch(srgbToOklab(c));
export const oklchToSrgb = (c: Vec3) => oklabToSrgb(oklchToOklab(c));

/** Brings an out-of-gamut OKLCH colour into sRGB by reducing chroma (keeps L and hue). */
export function gamutMapOklch(lch: Vec3): Vec3 {
  const inGamut = (c: Vec3) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let rgb = oklchToSrgb(lch);
  if (inGamut(rgb)) return rgb.map(clamp01) as Vec3;
  let lo = 0;
  let hi = lch[1];
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToSrgb([lch[0], mid, lch[2]]))) lo = mid;
    else hi = mid;
  }
  rgb = oklchToSrgb([lch[0], lo, lch[2]]);
  return rgb.map(clamp01) as Vec3;
}

/** Shortest-arc hue interpolation in degrees. */
export function mixHue(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/** Interpolates two sRGB colours in `space`; returns sRGB (clamped). */
export function mixIn(space: BlendSpace, a: Vec3, b: Vec3, t: number): Vec3 {
  switch (space) {
    case "srgb":
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    case "linear": {
      const la = srgbToLinear(a);
      const lb = srgbToLinear(b);
      return linearToSrgb([lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), lerp(la[2], lb[2], t)]).map(clamp01) as Vec3;
    }
    case "oklab": {
      const la = srgbToOklab(a);
      const lb = srgbToOklab(b);
      return oklabToSrgb([lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), lerp(la[2], lb[2], t)]).map(clamp01) as Vec3;
    }
    case "oklch": {
      const la = srgbToOklch(a);
      const lb = srgbToOklch(b);
      // Achromatic ends borrow the other end's hue so greys don't swing through the wheel.
      const ha = la[1] < 0.02 ? lb[2] : la[2];
      const hb = lb[1] < 0.02 ? la[2] : lb[2];
      return gamutMapOklch([lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), mixHue(ha, hb, t)]);
    }
  }
}

// ── gradient LUT ────────────────────────────────────────────────────────────────────────────

export interface Stop {
  color: string;
  /** 0..1 */
  pos: number;
}

export interface LutOptions {
  space: BlendSpace;
  /** −1..1: pushes the gradient towards the first (−) or last (+) colours. */
  bias: number;
  /** 0..1: 0 = smooth blends, 1 = hard bands. */
  sharpness: number;
}

export const LUT_SIZE = 256;

/** Sorted, clamped copy of the stops; evenly spaced when positions are missing/duplicated. */
export function tidyStops(stops: Stop[]): Stop[] {
  const list = stops.filter((s) => isHex(s.color)).slice(0, 8);
  if (list.length === 0) return [{ color: "#000000", pos: 0 }, { color: "#FFFFFF", pos: 1 }];
  if (list.length === 1) return [{ color: normHex(list[0].color), pos: 0 }, { color: normHex(list[0].color), pos: 1 }];
  return list
    .map((s, i) => ({ color: normHex(s.color), pos: Number.isFinite(s.pos) ? clamp01(s.pos) : i / (list.length - 1) }))
    .sort((a, b) => a.pos - b.pos);
}

/** Evenly spaced stops for a list of colours. */
export function evenStops(colors: string[]): Stop[] {
  const n = Math.max(1, colors.length - 1);
  return colors.map((c, i) => ({ color: c, pos: i / n }));
}

/** Applies bias (a gamma on t) and sharpness (snap towards the nearest stop). */
export function shapeT(t: number, stops: Stop[], o: Pick<LutOptions, "bias" | "sharpness">): number {
  let x = clamp01(t);
  const g = Math.pow(2, -clamp(o.bias, -1, 1) * 1.6);
  x = Math.pow(x, g);
  return x;
}

/** Colour of the gradient at t (sRGB 0..1), honouring space, bias and sharpness. */
export function sampleGradient(stopsIn: Stop[], t: number, o: LutOptions): Vec3 {
  const stops = tidyStops(stopsIn);
  const x = shapeT(t, stops, o);
  if (x <= stops[0].pos) return hexToRgb(stops[0].color);
  const last = stops[stops.length - 1];
  if (x >= last.pos) return hexToRgb(last.color);
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1].pos) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const span = Math.max(1e-6, b.pos - a.pos);
  let u = (x - a.pos) / span;
  // Sharpness: contract the blend zone around the midpoint between the two stops.
  const s = clamp01(o.sharpness);
  if (s > 0) {
    const w = Math.max(0.002, 1 - s);
    u = clamp01((u - 0.5) / w + 0.5);
    u = u * u * (3 - 2 * u);
  }
  return mixIn(o.space, hexToRgb(a.color), hexToRgb(b.color), u);
}

/** 256×1 RGBA8 lookup table for the GPU. */
export function buildLut(stops: Stop[], o: LutOptions, size = LUT_SIZE): Uint8Array {
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const c = sampleGradient(stops, i / (size - 1), o);
    out[i * 4] = Math.round(clamp01(c[0]) * 255);
    out[i * 4 + 1] = Math.round(clamp01(c[1]) * 255);
    out[i * 4 + 2] = Math.round(clamp01(c[2]) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ── contrast (WCAG 2.x) ─────────────────────────────────────────────────────────────────────

export function relLuminance(hex: string): number {
  const [r, g, b] = srgbToLinear(hexToRgb(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── harmonies (OKLCH) ───────────────────────────────────────────────────────────────────────

export type Harmony = "analogous" | "triad" | "complementary" | "split" | "mono";

export const HARMONIES: { id: Harmony; label: string }[] = [
  { id: "analogous", label: "Analogous" },
  { id: "triad", label: "Triad" },
  { id: "complementary", label: "Complementary" },
  { id: "split", label: "Split" },
  { id: "mono", label: "Mono" },
];

/** A dark → light palette of `n` colours built around `seed` with the given harmony. */
export function harmony(seed: string, kind: Harmony, n = 5): string[] {
  const [, C0, h0] = srgbToOklch(hexToRgb(seed));
  const C = Math.max(0.06, Math.min(0.2, C0 || 0.12));
  const offsets: Record<Harmony, number[]> = {
    analogous: [-40, -20, 0, 20, 40],
    triad: [0, 120, 240],
    complementary: [0, 180],
    split: [0, 150, 210],
    mono: [0],
  };
  const hues = offsets[kind];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const L = 0.22 + u * 0.66;
    const h = (h0 + hues[i % hues.length] + 360) % 360;
    const c = kind === "mono" ? C * (0.55 + 0.45 * Math.sin(u * Math.PI)) : C * (0.7 + 0.3 * Math.sin(u * Math.PI));
    out.push(rgbToHex(gamutMapOklch([L, c, h])));
  }
  return out;
}

/** Parses a pasted list of hex colours ("#fff, 0a84ff 123456 …"). */
export function parseHexList(text: string): string[] {
  const found = String(text).match(/#?\b[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? [];
  return found.slice(0, 8).map(normHex);
}

// ── palette extraction (k-means in OKLab) ───────────────────────────────────────────────────

/**
 * Picks `k` representative colours from RGBA pixels (downscale the image first; ≤ 64k pixels is
 * plenty). Deterministic: seeded k-means++ in OKLab, sorted dark → light. Transparent pixels skip.
 */
export function extractPalette(rgba: Uint8ClampedArray | Uint8Array, k = 5, seed = 7): string[] {
  const pts: Vec3[] = [];
  const step = Math.max(1, Math.floor(rgba.length / 4 / 16384));
  for (let i = 0; i < rgba.length; i += 4 * step) {
    if (rgba[i + 3] < 128) continue;
    pts.push(srgbToOklab([rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255]));
  }
  if (pts.length === 0) return [];
  k = Math.max(1, Math.min(k, pts.length));
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const d2 = (p: Vec3, q: Vec3) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const centres: Vec3[] = [pts[Math.floor(rnd() * pts.length)]];
  while (centres.length < k) {
    const dist = pts.map((p) => Math.min(...centres.map((c) => d2(p, c))));
    const total = dist.reduce((s, v) => s + v, 0);
    if (total <= 1e-12) break;
    let r = rnd() * total;
    let idx = 0;
    while (idx < dist.length - 1 && r > dist[idx]) r -= dist[idx++];
    centres.push(pts[idx]);
  }
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < pts.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = d2(pts[i], centres[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const s = sum[assign[i]];
      s[0] += pts[i][0];
      s[1] += pts[i][1];
      s[2] += pts[i][2];
      s[3]++;
    }
    for (let c = 0; c < centres.length; c++) if (sum[c][3]) centres[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  return centres
    .sort((p, q) => p[0] - q[0])
    .map((c) => rgbToHex(oklabToSrgb(c).map(clamp01) as Vec3));
}

// ── layer blend modes (CPU reference for the finish shader's blendOp) ────────────────────────

export type BlendMode = "normal" | "screen" | "overlay" | "soft-light";

/** Per-channel blend of `b` over `a` (both 0..1), matching FINISH_FS blendOp. */
export function blendChannel(a: number, b: number, mode: BlendMode): number {
  switch (mode) {
    case "screen":
      return 1 - (1 - a) * (1 - b);
    case "overlay":
      return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
    case "soft-light":
      return b < 0.5 ? 2 * a * b + a * a * (1 - 2 * b) : Math.sqrt(Math.max(a, 0)) * (2 * b - 1) + 2 * a * (1 - b);
    default:
      return b;
  }
}

export function blendColors(a: Vec3, b: Vec3, mode: BlendMode, amount = 1): Vec3 {
  return [0, 1, 2].map((i) => lerp(a[i], blendChannel(a[i], b[i], mode), clamp01(amount))) as Vec3;
}
