/**
 * Ambient backdrops: very slow, very quiet scenes drawn behind the desktop in the colours of the
 * active theme pack. See docs/AMBIENT.md.
 *
 * Every ambient scene is a pure painter: it fills a small RGBA buffer (a fraction of the screen's
 * resolution) and the canvas is scaled up by CSS. That keeps each frame to well under a
 * millisecond of main-thread work, and lets tests check every frame without a browser.
 *
 * Colour rule (why backdrops never get loud): a painter only chooses *weights* for a few colours
 * derived from the pack's own tokens. The final pixel is
 *
 *     base + k · Σ wᵢ · (colourᵢ − base),   Σ wᵢ ≤ 1,   k ≤ MAX_STRENGTH
 *
 * so no pixel can move more than k (≈ 9 %) of the way from the pack background towards any theme
 * colour. Luminance variation across a frame is therefore bounded by k, whatever the pack.
 */
import type { Palette, RGB } from "../types";
import { clamp, hslToRgb, mix, rgbToHsl } from "../util";

/** Highest share of the way from the background towards a theme colour any pixel may go. */
export const MAX_STRENGTH = 0.09;

export type Motion = "still" | "subtle" | "lively";

export const MOTIONS: { id: Motion; label: string }[] = [
  { id: "still", label: "Still" },
  { id: "subtle", label: "Subtle" },
  { id: "lively", label: "Lively" },
];

/** Speed multiplier and colour strength per motion level, tuned separately for light packs. */
export function motionTuning(motion: Motion, dark: boolean): { speed: number; strength: number } {
  const strength = dark ? { still: 0.07, subtle: 0.075, lively: 0.09 } : { still: 0.045, subtle: 0.05, lively: 0.065 };
  const speed = { still: 0, subtle: 1, lively: 1.8 };
  return { speed: speed[motion], strength: Math.min(MAX_STRENGTH, strength[motion]) };
}

/**
 * The colours a painter may weight, all derived from the pack palette:
 * 0 = foreground ink, 1 = accent, 2 = accent rotated (a companion hue), 3 = "deep" (darker or,
 * on light packs, slightly tinted towards the accent), 4 = elevated surface.
 */
export const INK = 0;
export const ACCENT = 1;
export const ACCENT2 = 2;
export const DEEP = 3;
export const SURFACE = 4;
export const CHANNELS = 5;

export interface Colours {
  base: RGB;
  /** CHANNELS colours. */
  list: RGB[];
  dark: boolean;
}

export interface ColourOpts {
  /** Hue rotation for the companion accent (degrees). */
  hueShift?: number;
  /** 0..1, how much of the accent's saturation to keep (misty scenes use less). */
  saturation?: number;
}

/** Colours a painter can use, from the active theme palette. No fixed hex values. */
export function coloursFrom(p: Palette, o: ColourOpts = {}): Colours {
  const sat = clamp(o.saturation ?? 1, 0, 1);
  const [h, s, l] = rgbToHsl(p.accent);
  // Monochrome packs (grey accent) get a hue from the ink/base relationship instead of a random one.
  const grey = s < 0.1;
  const accent = grey ? mix(p.fg, p.base, 0.35) : hslToRgb(h, s * sat, l);
  const accent2 = grey ? mix(p.fg, p.elevated, 0.5) : hslToRgb(h + (o.hueShift ?? 38), s * sat * 0.9, l);
  const [bh, bs, bl] = rgbToHsl(p.base);
  const deep = p.dark
    ? hslToRgb(grey ? bh : h, Math.max(bs, grey ? 0 : 0.25) * sat, clamp(bl * 0.4, 0, 1))
    : hslToRgb(grey ? bh : h, Math.max(bs, grey ? 0 : 0.3) * sat, clamp(bl * 0.82, 0, 1));
  return { base: p.base, list: [p.fg, accent, accent2, deep, p.elevated], dark: p.dark };
}

/** Linear blend of two colour sets (smooth re-tint when the theme changes). */
export function blendColours(a: Colours, b: Colours, t: number): Colours {
  return {
    base: mix(a.base, b.base, t),
    list: a.list.map((c, i) => mix(c, b.list[i], t)),
    dark: t < 0.5 ? a.dark : b.dark,
  };
}

/**
 * Pre-computed deltas so a painter writes a pixel with a handful of multiply-adds.
 * `delta[c*3 + k]` = strength · (colour c − base) for channel k.
 */
export interface Ink {
  base: Float32Array;
  delta: Float32Array;
}

export function makeInk(c: Colours, strength: number): Ink {
  const k = clamp(strength, 0, MAX_STRENGTH);
  const base = new Float32Array([c.base.r, c.base.g, c.base.b]);
  const delta = new Float32Array(CHANNELS * 3);
  c.list.forEach((col, i) => {
    delta[i * 3] = k * (col.r - c.base.r);
    delta[i * 3 + 1] = k * (col.g - c.base.g);
    delta[i * 3 + 2] = k * (col.b - c.base.b);
  });
  return { base, delta };
}

/**
 * Writes pixel `i` (index into RGBA buffer / 4) with weights for up to three channels.
 * Weights are clamped so their sum never exceeds 1 (see the colour rule above).
 */
export function put(
  buf: Uint8ClampedArray,
  i: number,
  ink: Ink,
  c0: number,
  w0: number,
  c1 = 0,
  w1 = 0,
  c2 = 0,
  w2 = 0
): void {
  if (w0 < 0) w0 = 0;
  if (w1 < 0) w1 = 0;
  if (w2 < 0) w2 = 0;
  const sum = w0 + w1 + w2;
  if (sum > 1) {
    w0 /= sum;
    w1 /= sum;
    w2 /= sum;
  }
  const d = ink.delta;
  const a = c0 * 3, b = c1 * 3, c = c2 * 3;
  const o = i * 4;
  buf[o] = ink.base[0] + w0 * d[a] + w1 * d[b] + w2 * d[c];
  buf[o + 1] = ink.base[1] + w0 * d[a + 1] + w1 * d[b + 1] + w2 * d[c + 1];
  buf[o + 2] = ink.base[2] + w0 * d[a + 2] + w1 * d[b + 2] + w2 * d[c + 2];
  buf[o + 3] = 255;
}

/**
 * Local copies of the base colour and one channel's deltas, for hot loops that write pixels
 * directly. Callers must keep the sum of weights they apply at or below 1 (the colour rule);
 * the luminance tests in src/__tests__/ambient.test.ts check every scene against that.
 */
export function chan(ink: Ink, c: number): [number, number, number] {
  return [ink.delta[c * 3], ink.delta[c * 3 + 1], ink.delta[c * 3 + 2]];
}

/** 32-bit view of an RGBA buffer (little-endian: 0xAABBGGRR), for one store per pixel. */
export function words(buf: Uint8ClampedArray): Uint32Array {
  return new Uint32Array(buf.buffer, buf.byteOffset, buf.length >> 2);
}

/** Packs an opaque colour for a `words()` store. Inputs must already be within 0..255. */
export function pack(r: number, g: number, b: number): number {
  return 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

/** Fills the whole buffer with the pack background. */
export function clear(buf: Uint8ClampedArray, ink: Ink): void {
  words(buf).fill(pack(Math.round(ink.base[0]), Math.round(ink.base[1]), Math.round(ink.base[2])));
}

/** 4×4 ordered-dither (Bayer) thresholds in 0..1. */
export const BAYER4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));

export const TAU = Math.PI * 2;

/** Per-scene knobs a pack mapping can set (all optional, all gentle). */
export interface AmbientParams {
  /** Multiplies the scene's base speed (0.5 = half as fast). */
  speed?: number;
  /** Multiplies the scene's colour weights (≤ 1.3; the global cap still applies). */
  amount?: number;
  /** Companion-hue rotation in degrees. */
  hueShift?: number;
  /** Accent saturation kept, 0..1 (misty scenes use less). */
  saturation?: number;
  /** Scene-specific density (bands, lines, dots), 0.5..2. */
  density?: number;
}

/** What a painter gets every frame. */
export interface PaintFrame {
  buf: Uint8ClampedArray;
  w: number;
  h: number;
  /** Scene time in seconds (already scaled by motion speed). */
  t: number;
  ink: Ink;
  params: Required<AmbientParams>;
  dark: boolean;
}

export interface AmbientPainter {
  /** Called once per buffer size; return per-size state (tables, textures). */
  init(w: number, h: number, seed: number, dark: boolean): unknown;
  paint(f: PaintFrame, state: unknown): void;
}

export interface AmbientScene {
  id: string;
  name: string;
  blurb: string;
  /** Screen pixels per buffer pixel (8 = very soft, 3 = fine detail). */
  scale: number;
  /** Nearest-neighbour upscale (dither, pixel, scanline looks) instead of a soft one. */
  pixelated: boolean;
  /** Seconds for one full slow cycle at "Subtle" (20–90 s). */
  cycle: number;
  painter: AmbientPainter;
}

export function withDefaults(p: AmbientParams | undefined): Required<AmbientParams> {
  return {
    speed: clamp(p?.speed ?? 1, 0.2, 2),
    amount: clamp(p?.amount ?? 1, 0.3, 1.3),
    hueShift: p?.hueShift ?? 38,
    saturation: clamp(p?.saturation ?? 1, 0, 1),
    density: clamp(p?.density ?? 1, 0.5, 2),
  };
}

/** Buffer size for a screen size and scene scale (at least 16×16). */
export function bufferSize(cssW: number, cssH: number, scale: number): { w: number; h: number } {
  return { w: Math.max(16, Math.round(cssW / scale)), h: Math.max(16, Math.round(cssH / scale)) };
}

/**
 * Renders one frame of `scene` into a fresh buffer. Used by tests, screenshots and the runner.
 */
export function renderFrame(
  scene: AmbientScene,
  w: number,
  h: number,
  t: number,
  palette: Palette,
  opts: { seed?: number; motion?: Motion; params?: AmbientParams; state?: unknown } = {}
): { buf: Uint8ClampedArray; state: unknown } {
  const params = withDefaults(opts.params);
  const { strength } = motionTuning(opts.motion ?? "subtle", palette.dark);
  const colours = coloursFrom(palette, { hueShift: params.hueShift, saturation: params.saturation });
  const ink = makeInk(colours, strength);
  const state = opts.state ?? scene.painter.init(w, h, opts.seed ?? 1, palette.dark);
  const buf = new Uint8ClampedArray(w * h * 4);
  scene.painter.paint({ buf, w, h, t, ink, params, dark: palette.dark }, state);
  return { buf, state };
}

/** Relative luminance (0..1, sRGB-weighted, no gamma) of buffer pixel o (byte offset). */
export function lumAt(buf: Uint8ClampedArray, o: number): number {
  return (0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2]) / 255;
}

/** Max − min luminance across a buffer. */
export function lumRange(buf: Uint8ClampedArray): number {
  let lo = 1, hi = 0;
  for (let o = 0; o < buf.length; o += 4) {
    const l = lumAt(buf, o);
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  return hi - lo;
}
