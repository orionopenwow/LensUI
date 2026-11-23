/**
 * Inspire (mood-steered randomising with locks), plain-language prompts and adjustments.
 * Deterministic for a given seed, so tests and "undo" are exact. No network, no model needed:
 * the Lab can also ask the local AI engine, which only fills in the same `Mood` + keywords.
 */
import { clamp, evenStops, gamutMapOklch, harmony, hexToRgb, rgbToHex, srgbToOklch, tidyStops, type Harmony } from "./color";
import { MODES, modeById, type ModeId } from "./modes";
import { RANGES, normaliseState, type BackdropState } from "./state";

export interface Mood {
  /** 0 calm … 1 energetic */
  energy: number;
  /** 0 cool … 1 warm */
  warmth: number;
  /** 0 minimal … 1 rich */
  richness: number;
}

export const DEFAULT_MOOD: Mood = { energy: 0.35, warmth: 0.5, richness: 0.5 };

/** Things Inspire can leave alone. */
export type LockKey = "mode" | "palette" | "motion" | "shape" | "grade" | "effects" | "handles";
export const LOCKS: { id: LockKey; label: string }[] = [
  { id: "mode", label: "Look" },
  { id: "palette", label: "Colours" },
  { id: "motion", label: "Motion" },
  { id: "shape", label: "Shape" },
  { id: "grade", label: "Grade" },
  { id: "effects", label: "Effects" },
  { id: "handles", label: "Handles" },
];

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How lively each look reads at its defaults (0 calm … 1 busy); steers Inspire by mood. */
export const MODE_ENERGY: Record<ModeId, number> = {
  mesh: 0.15, bands: 0.35, curtains: 0.4, plasma: 0.65, rays: 0.45, caustics: 0.6, marble: 0.3, cells: 0.45,
  glass: 0.3, bokeh: 0.4, eclipse: 0.3, horizon: 0.15, prism: 0.35, smoke: 0.35, edgeglow: 0.15, kaleido: 0.75,
  beam: 0.25, halftone: 0.3, window: 0.1, sea: 0.25, shards: 0.4, pixelscape: 0.5, tunnel: 0.85, streaks: 0.95,
  tiles: 0.3, planet: 0.2, nebula: 0.35, photoglass: 0.3, photomap: 0.3,
};

/** A dark → light palette steered by mood. */
export function moodPalette(m: Mood, r: () => number): string[] {
  // Warm hues ~20–80°, cool ~190–290°.
  const hue = m.warmth >= 0.5 ? 15 + r() * 70 * (1.2 - m.warmth) + (m.warmth - 0.5) * 20 : 190 + r() * 100 * (0.5 + m.warmth);
  const kinds: Harmony[] = m.richness > 0.7 ? ["triad", "split", "analogous"] : m.richness > 0.35 ? ["analogous", "split", "complementary"] : ["mono", "analogous"];
  const kind = kinds[Math.floor(r() * kinds.length)];
  const n = 3 + Math.round(m.richness * 3 + r());
  const chroma = 0.06 + 0.16 * m.richness + 0.04 * m.energy;
  const seed = rgbToHex(gamutMapOklch([0.6, chroma, hue]));
  const pal = harmony(seed, kind, Math.min(7, n));
  // Most backdrops sit behind icons: keep the darkest stop dark.
  const [, c0, h0] = srgbToOklch(hexToRgb(pal[0]));
  pal[0] = rgbToHex(gamutMapOklch([0.08 + 0.08 * r(), c0 * 0.8, h0]));
  return pal;
}

/** New state from `prev`, re-rolling everything not locked. */
export function inspire(prev: BackdropState, mood: Mood = DEFAULT_MOOD, locks: ReadonlySet<LockKey> = new Set(), seed = Date.now()): BackdropState {
  const r = rng(seed);
  const s: BackdropState = JSON.parse(JSON.stringify(prev));
  if (!locks.has("mode")) {
    const pool = MODES.filter((m) => !m.image).map((m) => ({ m, w: 1 - Math.abs(MODE_ENERGY[m.id] - mood.energy) * 1.3 }));
    const total = pool.reduce((a, p) => a + Math.max(0.02, p.w), 0);
    let x = r() * total;
    let chosen = pool[0].m;
    for (const p of pool) {
      x -= Math.max(0.02, p.w);
      if (x <= 0) {
        chosen = p.m;
        break;
      }
    }
    if (chosen.id !== s.mode) {
      s.mode = chosen.id;
      s.params = Object.fromEntries(chosen.params.map((p) => [p.key, p.default]));
      s.handles = chosen.handles.map((h) => ({ ...h.default }));
    }
    const m = modeById(s.mode)!;
    for (const p of m.params) {
      if (p.step >= 1) continue;
      const span = (p.max - p.min) * 0.25;
      s.params[p.key] = clamp(p.default + (r() - 0.5) * 2 * span, p.min, p.max);
    }
  }
  if (!locks.has("palette")) {
    s.stops = evenStops(moodPalette(mood, r));
    s.space = r() < 0.6 ? "oklab" : r() < 0.5 ? "oklch" : "linear";
    s.bias = (r() - 0.5) * 0.4;
    s.sharpness = mood.energy > 0.7 && r() < 0.3 ? 0.4 * r() : 0;
  }
  if (!locks.has("motion")) {
    s.speed = clamp(0.04 + mood.energy * 0.42 + (r() - 0.5) * 0.08, 0, 1);
    s.warp = clamp(0.08 + mood.richness * 0.35 + (r() - 0.5) * 0.12, 0, 1);
  }
  if (!locks.has("shape")) {
    s.scale = clamp(0.9 + r() * 1.2, RANGES.scale[0], RANGES.scale[1]);
    s.softness = clamp(0.35 + (1 - mood.energy) * 0.45 + (r() - 0.5) * 0.2, 0, 1);
    s.seed = Math.floor(r() * 99999);
  }
  if (!locks.has("grade")) {
    s.contrast = 1 + (r() - 0.5) * 0.15;
    s.saturation = 0.95 + mood.richness * 0.25;
    s.tone = r() < 0.35 ? "aces" : "none";
    s.exposure = s.tone === "aces" ? 0.2 : 0;
  }
  if (!locks.has("effects")) {
    s.grain = Math.round((0.01 + r() * 0.03) * 1000) / 1000;
    s.vignette = r() < 0.5 ? 0.2 + r() * 0.3 : 0;
    s.bloom = r() < 0.4 ? 0.15 + r() * 0.3 : 0;
    s.aberration = s.mode === "streaks" ? 0.5 : 0;
  }
  if (!locks.has("handles") && s.handles.length) {
    s.handles = s.handles.map((h) => ({ x: clamp(h.x + (r() - 0.5) * 0.3, 0.05, 0.95), y: clamp(h.y + (r() - 0.5) * 0.3, 0.05, 0.95) }));
  }
  delete s.name;
  return normaliseState(s);
}

// ── words → parameters ──────────────────────────────────────────────────────────────────────

const COLOUR_HUES: [RegExp, number, number?][] = [
  [/\b(red|crimson|scarlet)\b/, 25],
  [/\b(orange|amber|tangerine)\b/, 55],
  [/\b(gold|golden|yellow|honey)\b/, 85],
  [/\b(lime|green|emerald|forest|mint|jade)\b/, 150],
  [/\b(teal|turquoise|aqua|cyan)\b/, 195],
  [/\b(blue|azure|cobalt|navy|ocean)\b/, 255],
  [/\b(indigo)\b/, 275],
  [/\b(purple|violet|lilac|lavender|amethyst)\b/, 300],
  [/\b(magenta|fuchsia)\b/, 330],
  [/\b(pink|rose|blush|peach)\b/, 0],
];

const MODE_WORDS: [RegExp, ModeId][] = [
  [/\b(aurora|northern lights|curtain|drape)s?\b/, "curtains"],
  [/\b(beam|spotlight|shaft)\b/, "beam"],
  [/\b(rays?|god ?rays|sunbeams?)\b/, "rays"],
  [/\b(sea|ocean|sunset|moonrise|horizon over water)\b/, "sea"],
  [/\b(window|sunlit wall|leaf shadows?|afternoon light)\b/, "window"],
  [/\b(ribbed|fluted|reeded)\b/, "glass"],
  [/\b(crystal|shards?|gem|quartz|facet)s?\b/, "shards"],
  [/\b(tiles?|grid)\b/, "tiles"],
  [/\b(planet|orbit|space|earthrise)\b/, "planet"],
  [/\b(nebula|galaxy|cosmic|lens)\b/, "nebula"],
  [/\b(smoke|ink|fog|mist)\b/, "smoke"],
  [/\b(marble|stone|veins?)\b/, "marble"],
  [/\b(pixel|8-?bit|retro game)\b/, "pixelscape"],
  [/\b(tunnel|warp|hyperspace)\b/, "tunnel"],
  [/\b(speed|streaks?|motion lines|rush)\b/, "streaks"],
  [/\b(bokeh|fairy lights|city lights)\b/, "bokeh"],
  [/\b(caustics?|pool|underwater)\b/, "caustics"],
  [/\b(eclipse|corona|ring)\b/, "eclipse"],
  [/\b(halftone|dots|dotted|print)\b/, "halftone"],
  [/\b(kaleido\w*|mandala)\b/, "kaleido"],
  [/\b(plasma|lava|lava lamp|liquid)\b/, "plasma"],
  [/\b(stripes?|bands?|waves?)\b/, "bands"],
  [/\b(cells?|voronoi|bubbles)\b/, "cells"],
  [/\b(prism|rainbow|spectrum)\b/, "prism"],
  [/\b(edge|line horizon|light line)\b/, "edgeglow"],
  [/\b(dawn|glow|horizon)\b/, "horizon"],
  [/\b(mesh|gradient|blobs?|soft)\b/, "mesh"],
];

function huesIn(t: string): number[] {
  return COLOUR_HUES.filter(([re]) => re.test(t)).map(([, h]) => h);
}

/** Palette from named colours plus light/dark/pastel/vivid words. */
function wordPalette(t: string, hues: number[], warmth: number): string[] {
  const dark = /\b(dark|night|midnight|moody|deep)\b/.test(t);
  const light = /\b(light|bright|airy|pastel|day|daylight)\b/.test(t);
  const vivid = /\b(vivid|neon|electric|bold|saturated)\b/.test(t);
  const pastel = /\b(pastel|muted|soft|dusty)\b/.test(t);
  const h = hues.length ? hues : [warmth > 0.5 ? 40 : 250];
  const C = vivid ? 0.2 : pastel ? 0.07 : 0.13;
  const lo = dark ? 0.06 : light ? 0.45 : 0.12;
  const hi = dark ? 0.75 : light ? 0.97 : 0.93;
  const n = Math.max(4, Math.min(6, h.length + 3));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const hue = h.length === 1 ? h[0] + (u - 0.5) * 30 : h[Math.min(h.length - 1, Math.floor(u * h.length))];
    out.push(rgbToHex(gamutMapOklch([lo + (hi - lo) * u, C * Math.sin(0.25 + u * 2.6) + 0.02, (hue + 360) % 360])));
  }
  return out;
}

export interface PromptResult {
  state: BackdropState;
  /** What was understood, for the UI ("Aurora curtains · blue · calm"). */
  understood: string[];
}

/** Deterministic text → backdrop: "make me a calm blue aurora backdrop". */
export function promptToState(text: string, base: BackdropState, seed = 1): PromptResult {
  const t = ` ${String(text).toLowerCase()} `;
  const understood: string[] = [];
  const mode = MODE_WORDS.find(([re]) => re.test(t))?.[1];
  const calm = /\b(calm|slow|gentle|quiet|relaxing|still|subtle|soothing)\b/.test(t);
  const lively = /\b(lively|fast|energetic|busy|wild|dynamic|intense)\b/.test(t);
  const warm = /\b(warm|sunset|fire|cosy|cozy|autumn)\b/.test(t);
  const cool = /\b(cool|cold|icy|winter|frost)\b/.test(t);
  const mood: Mood = {
    energy: calm ? 0.12 : lively ? 0.85 : 0.35,
    warmth: warm ? 0.85 : cool ? 0.15 : 0.5,
    richness: /\b(rich|complex|detailed|lush)\b/.test(t) ? 0.85 : /\b(minimal|simple|clean|plain)\b/.test(t) ? 0.15 : 0.5,
  };
  const locks = new Set<LockKey>();
  let s = base;
  if (mode) {
    const m = modeById(mode)!;
    s = { ...s, mode, params: Object.fromEntries(m.params.map((p) => [p.key, p.default])), handles: m.handles.map((h) => ({ ...h.default })) };
    locks.add("mode");
    understood.push(m.name);
  }
  s = inspire(s, mood, locks, seed);
  const hues = huesIn(t);
  if (hues.length || /\b(dark|light|pastel|vivid|neon|muted|night)\b/.test(t)) {
    s = { ...s, stops: evenStops(wordPalette(t, hues, mood.warmth)) };
    understood.push(...COLOUR_HUES.filter(([re]) => re.test(t)).map(([re]) => re.source.replace(/\\b|\(|\)/g, "").split("|")[0]));
  }
  if (calm) understood.push("calm");
  if (lively) understood.push("lively");
  if (warm) understood.push("warm");
  if (cool) understood.push("cool");
  return { state: normaliseState(s), understood };
}

function rotatePalette(s: BackdropState, toward: number, amount: number): BackdropState {
  const stops = tidyStops(s.stops).map((st) => {
    const [L, C, h] = srgbToOklch(hexToRgb(st.color));
    const d = ((toward - h + 540) % 360) - 180;
    const C2 = C < 0.03 ? Math.max(C, 0.06 * amount) : C;
    return { ...st, color: rgbToHex(gamutMapOklch([L, C2, (h + d * amount + 360) % 360])) };
  });
  return { ...s, stops };
}

function scalePalette(s: BackdropState, fn: (lch: [number, number, number]) => [number, number, number]): BackdropState {
  return { ...s, stops: tidyStops(s.stops).map((st) => ({ ...st, color: rgbToHex(gamutMapOklch(fn(srgbToOklch(hexToRgb(st.color))))) })) };
}

/** Adjusts the current state instead of replacing it: "slower and more purple", "warmer", "less grain". */
export function adjustState(s0: BackdropState, text: string): { state: BackdropState; changes: string[] } {
  const t = ` ${String(text).toLowerCase()} `;
  let s: BackdropState = JSON.parse(JSON.stringify(s0));
  const changes: string[] = [];
  const more = (w: string) => new RegExp(`\\b(more|extra|bit more)\\s+${w}`).test(t);
  if (/\b(slower|calmer|gentler|slow it down)\b/.test(t)) {
    s.speed = clamp(s.speed * 0.6, 0, 1);
    changes.push("slower");
  }
  if (/\b(faster|livelier|speed it up|more energy|more energetic)\b/.test(t)) {
    s.speed = clamp(Math.max(0.05, s.speed) * 1.6, 0, 1);
    changes.push("faster");
  }
  for (const [re, hue] of COLOUR_HUES) {
    const word = re.source.replace(/\\b|\(|\)/g, "").split("|")[0];
    if (new RegExp(`\\b(more|towards?|bit more|make it)\\s+${re.source.replace(/\\b/g, "")}`).test(t)) {
      s = rotatePalette(s, hue, 0.45);
      changes.push(`more ${word}`);
    }
  }
  if (/\bwarmer\b/.test(t)) {
    s = rotatePalette(s, 45, 0.25);
    changes.push("warmer");
  }
  if (/\b(cooler|colder)\b/.test(t)) {
    s = rotatePalette(s, 240, 0.25);
    changes.push("cooler");
  }
  if (/\b(brighter|lighter)\b/.test(t)) {
    s.exposure = clamp(s.exposure + 0.35, -2, 2);
    changes.push("brighter");
  }
  if (/\b(darker|dimmer|moodier)\b/.test(t)) {
    s.exposure = clamp(s.exposure - 0.35, -2, 2);
    changes.push("darker");
  }
  if (more("grain") || /\bgrainier\b/.test(t)) {
    s.grain = clamp(s.grain + 0.02, 0, 0.2);
    changes.push("more grain");
  }
  if (/\b(less|no) grain\b/.test(t)) {
    s.grain = /\bno grain\b/.test(t) ? 0 : clamp(s.grain - 0.02, 0, 0.2);
    changes.push("less grain");
  }
  if (/\b(softer|smoother|blurrier)\b/.test(t)) {
    s.softness = clamp(s.softness + 0.2, 0, 1);
    changes.push("softer");
  }
  if (/\b(sharper|crisper|harder)\b/.test(t)) {
    s.softness = clamp(s.softness - 0.2, 0, 1);
    changes.push("sharper");
  }
  if (more("contrast")) {
    s.contrast = clamp(s.contrast + 0.15, 0.5, 1.5);
    changes.push("more contrast");
  }
  if (/\b(more (saturated|vivid|colou?rful)|punchier)\b/.test(t)) {
    s.saturation = clamp(s.saturation + 0.25, 0, 2);
    changes.push("more vivid");
  }
  if (/\b(muted|less saturated|desaturate|subtler colou?rs?)\b/.test(t)) {
    s.saturation = clamp(s.saturation - 0.25, 0, 2);
    changes.push("muted");
  }
  if (/\b(pastel)\b/.test(t)) {
    s = scalePalette(s, ([L, C, h]) => [Math.min(0.95, L + 0.12), C * 0.55, h]);
    changes.push("pastel");
  }
  if (more("warp") || /\b(swirlier|more swirl)\b/.test(t)) {
    s.warp = clamp(s.warp + 0.15, 0, 1);
    changes.push("more warp");
  }
  if (/\b(less warp|straighter|less swirl)\b/.test(t)) {
    s.warp = clamp(s.warp - 0.15, 0, 1);
    changes.push("less warp");
  }
  return { state: normaliseState(s), changes };
}

/** True when the text reads as a tweak of the current look rather than a new one. */
export function isAdjustment(text: string): boolean {
  return /\b(make it|more|less|slower|faster|warmer|cooler|brighter|darker|softer|sharper|calmer|livelier|grainier|muted|punchier)\b/.test(String(text).toLowerCase());
}
