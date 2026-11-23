/**
 * Tiny pixel helpers for the Living Themes painters. Every painter writes straight into a
 * Uint32Array view of an RGBA ImageData (little-endian: 0xAABBGGRR), at a fraction of the
 * screen's resolution; the canvas is scaled up by CSS. Gradients survive the upscale and the
 * painters stay under a few milliseconds, so tests can time and hash frames without a browser.
 */
import type { RGB } from "../types";

export const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });

/** 4×4 ordered-dither offsets in −0.5..0.5 of one 8-bit step (kills banding in dark skies). */
export const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47));

export function pack(r: number, g: number, b: number): number {
  const R = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const G = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const B = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
}

/** Fill one row with a colour, dithered with the 4-pixel Bayer pattern for that row. */
export function fillRow(px: Uint32Array, w: number, y: number, r: number, g: number, b: number) {
  const o = y * w;
  const by = (y & 3) * 4;
  const n = Math.min(4, w);
  for (let x = 0; x < n; x++) {
    const d = BAYER[by + x];
    px[o + x] = pack(r + d, g + d, b + d);
  }
  // Doubling copy: log2(w) copies instead of w writes.
  let filled = n;
  while (filled < w) {
    const len = Math.min(filled, w - filled);
    px.copyWithin(o + filled, o, o + len);
    filled += len;
  }
}

/** Blend colour (r,g,b) over pixel i with alpha a (0..1). */
export function blend(px: Uint32Array, i: number, r: number, g: number, b: number, a: number) {
  const p = px[i];
  const pr = p & 255, pg = (p >>> 8) & 255, pb = (p >>> 16) & 255;
  px[i] = pack(pr + (r - pr) * a + 0.5, pg + (g - pg) * a + 0.5, pb + (b - pb) * a + 0.5);
}

/** Add light (r,g,b)·k to pixel i (screen-like, clamped). */
export function addLight(px: Uint32Array, i: number, r: number, g: number, b: number, k: number) {
  const p = px[i];
  px[i] = pack((p & 255) + r * k + 0.5, ((p >>> 8) & 255) + g * k + 0.5, ((p >>> 16) & 255) + b * k + 0.5);
}

export function unpack(p: number): RGB {
  return { r: p & 255, g: (p >>> 8) & 255, b: (p >>> 16) & 255 };
}

/** Small, fast, deterministic hash -> 0..1 (for per-window / per-star variation). */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** 32-bit FNV-1a over a pixel buffer (determinism tests and parity checks). */
export function hashPixels(px: Uint32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i++) {
    h ^= px[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
