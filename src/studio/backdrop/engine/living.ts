/**
 * Living wallpaper maths (pure, testable): state interpolation, time-of-day keyframes, playlists,
 * slow "evolve" drift inside a mood range, and gentle reactions to the system.
 */
import { clamp, gamutMapOklch, hexToRgb, lerp, mixIn, rgbToHex, srgbToOklch, tidyStops, type Stop } from "./color";
import { RANGES, normaliseState, type BackdropState, type RangeKey } from "./state";

const NUMERIC: RangeKey[] = ["scale", "softness", "warp", "speed", "brightness", "contrast", "saturation", "exposure", "grain", "vignette", "aberration", "bloom", "bias", "sharpness"];

function resample(stops: Stop[], n: number): string[] {
  const s = tidyStops(stops);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : i / (n - 1);
    let k = 0;
    while (k < s.length - 2 && x > s[k + 1].pos) k++;
    const a = s[k];
    const b = s[Math.min(s.length - 1, k + 1)];
    const u = b.pos > a.pos ? clamp((x - a.pos) / (b.pos - a.pos), 0, 1) : 0;
    out.push(rgbToHex(mixIn("oklab", hexToRgb(a.color), hexToRgb(b.color), u)));
  }
  return out;
}

/**
 * Blend two states. Numbers lerp, colours mix in OKLab (stop counts are matched by resampling),
 * handles move. The look itself switches at t = 0.5 when the two differ (the renderer crossfades).
 */
export function interpolateStates(a: BackdropState, b: BackdropState, t: number): BackdropState {
  const u = clamp(t, 0, 1);
  const out: BackdropState = JSON.parse(JSON.stringify(u < 0.5 ? a : b));
  for (const k of NUMERIC) (out as unknown as Record<string, number>)[k] = lerp(a[k] as number, b[k] as number, u);
  const n = Math.max(a.stops.length, b.stops.length);
  const ca = resample(a.stops, n);
  const cb = resample(b.stops, n);
  out.stops = ca.map((c, i) => ({ color: rgbToHex(mixIn("oklab", hexToRgb(c), hexToRgb(cb[i]), u)), pos: n === 1 ? 0 : i / (n - 1) }));
  if (a.mode === b.mode) {
    for (const key of Object.keys(out.params)) out.params[key] = lerp(a.params[key] ?? out.params[key], b.params[key] ?? out.params[key], u);
    out.handles = out.handles.map((h, i) => ({ x: lerp(a.handles[i]?.x ?? h.x, b.handles[i]?.x ?? h.x, u), y: lerp(a.handles[i]?.y ?? h.y, b.handles[i]?.y ?? h.y, u) }));
  }
  return normaliseState(out);
}

// ── time-of-day keyframes ───────────────────────────────────────────────────────────────────

export type DayPart = "morning" | "noon" | "evening" | "night";
export const DAY_PARTS: { id: DayPart; label: string; hour: number }[] = [
  { id: "morning", label: "Morning", hour: 7 },
  { id: "noon", label: "Noon", hour: 13 },
  { id: "evening", label: "Evening", hour: 19 },
  { id: "night", label: "Night", hour: 23 },
];

export type Keyframes = Partial<Record<DayPart, BackdropState>>;

/** Which two keyframes surround `hour` (0–24) and how far between them we are. */
export function keyframeBlend(keys: Keyframes, hour: number): { a: BackdropState; b: BackdropState; t: number } | null {
  const set = DAY_PARTS.filter((p) => keys[p.id]);
  if (set.length === 0) return null;
  if (set.length === 1) return { a: keys[set[0].id]!, b: keys[set[0].id]!, t: 0 };
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < set.length; i++) {
    const cur = set[i];
    const nxt = set[(i + 1) % set.length];
    const start = cur.hour;
    const end = nxt.hour > start ? nxt.hour : nxt.hour + 24;
    const hh = h < start ? h + 24 : h;
    if (hh >= start && hh < end) {
      // Hold each look for the first half of its slot, then ease into the next.
      const x = (hh - start) / (end - start);
      const t = x < 0.5 ? 0 : smooth((x - 0.5) / 0.5);
      return { a: keys[cur.id]!, b: keys[nxt.id]!, t };
    }
  }
  return { a: keys[set[0].id]!, b: keys[set[0].id]!, t: 0 };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export function keyframeState(keys: Keyframes, hour: number): BackdropState | null {
  const k = keyframeBlend(keys, hour);
  return k ? interpolateStates(k.a, k.b, k.t) : null;
}

// ── playlist ────────────────────────────────────────────────────────────────────────────────

/** Index of the playlist entry showing at `nowMs` when rotating every `minutes`. */
export function playlistIndex(startMs: number, nowMs: number, minutes: number, count: number): number {
  if (count <= 0) return -1;
  const period = Math.max(1, minutes) * 60_000;
  const n = Math.floor(Math.max(0, nowMs - startMs) / period);
  return n % count;
}

/** Milliseconds until the next rotation. */
export function playlistNextIn(startMs: number, nowMs: number, minutes: number): number {
  const period = Math.max(1, minutes) * 60_000;
  const e = Math.max(0, nowMs - startMs) % period;
  return period - e;
}

// ── evolve ──────────────────────────────────────────────────────────────────────────────────

/** Keys evolve may move, with how far (fraction of each range) at range = 1. */
const EVOLVE: [RangeKey, number][] = [
  ["warp", 0.25],
  ["speed", 0.15],
  ["softness", 0.2],
  ["scale", 0.12],
  ["saturation", 0.1],
  ["contrast", 0.08],
];

/**
 * Slow drift around `base`, a pure function of minutes since start. Uses incommensurate periods
 * (minutes to hours) so the backdrop never repeats, and never leaves base ± range of each control.
 */
export function evolve(base: BackdropState, minutes: number, range = 0.5, seed = 1): BackdropState {
  const s: BackdropState = JSON.parse(JSON.stringify(base));
  const r = clamp(range, 0, 1);
  EVOLVE.forEach(([k, span], i) => {
    const [lo, hi] = RANGES[k];
    const amp = (hi - lo) * span * r;
    const period = 7 + i * 4.3 + (seed % 5);
    const v = (base[k] as number) + amp * Math.sin((minutes / period) * Math.PI * 2 + seed * 1.7 + i * 2.1);
    (s as unknown as Record<string, number>)[k] = clamp(v, lo, hi);
  });
  // Palette hue wanders up to ±24° × range on a 47-minute cycle.
  const dh = 24 * r * Math.sin((minutes / 47) * Math.PI * 2 + seed);
  s.stops = tidyStops(base.stops).map((st) => {
    const [L, C, h] = srgbToOklch(hexToRgb(st.color));
    return { ...st, color: rgbToHex(gamutMapOklch([L, C, (h + dh + 360) % 360])) };
  });
  return normaliseState(s);
}

/** How far evolve may move key k for a base value (used by tests and the UI range hint). */
export function evolveBounds(base: BackdropState, k: RangeKey, range = 0.5): [number, number] {
  const e = EVOLVE.find(([key]) => key === k);
  const [lo, hi] = RANGES[k];
  const amp = e ? (hi - lo) * e[1] * clamp(range, 0, 1) : 0;
  return [Math.max(lo, (base[k] as number) - amp), Math.min(hi, (base[k] as number) + amp)];
}

// ── reactions ───────────────────────────────────────────────────────────────────────────────

export interface Reactions {
  /** 0..1 CPU load (busy warms the colours a little). */
  cpu?: number;
  /** Focus mode on: motion calms. */
  focus?: boolean;
  /** Sun height −1 (midnight) … 1 (noon); shifts exposure and warmth gently. */
  sun?: number | null;
  /** Album-art colours to follow (opt-in). */
  album?: string[] | null;
  /** Weather word from the weather source (opt-in). */
  weather?: "clear" | "cloudy" | "rain" | "snow" | "storm" | null;
}

/** Applies small, bounded nudges. Never more than ±10° hue, ±0.3 EV, ×0.5 speed. */
export function applyReactions(base: BackdropState, r: Reactions): BackdropState {
  let s: BackdropState = JSON.parse(JSON.stringify(base));
  const cpu = clamp(r.cpu ?? 0, 0, 1);
  let warmShift = cpu > 0.5 ? (cpu - 0.5) * 2 * 10 : 0;
  if (typeof r.sun === "number") {
    const sun = clamp(r.sun, -1, 1);
    s.exposure = clamp(s.exposure + sun * 0.15 - (sun < 0 ? 0.15 : 0), -2, 2);
    // Golden hours: warm when the sun is low but up.
    if (sun > 0 && sun < 0.3) warmShift += (0.3 - sun) / 0.3 * 6;
  }
  if (r.weather === "cloudy" || r.weather === "rain") s.saturation = clamp(s.saturation * 0.85, 0, 2);
  if (r.weather === "rain" || r.weather === "storm") s.speed = clamp(s.speed * 1.15, 0, 1);
  if (r.weather === "snow") s.exposure = clamp(s.exposure + 0.1, -2, 2);
  if (warmShift > 0) {
    s.stops = tidyStops(s.stops).map((st) => {
      const [L, C, h] = srgbToOklch(hexToRgb(st.color));
      if (C < 0.02) return st;
      // Turn at most `warmShift` degrees towards amber (50°), never past it.
      const d = ((50 - h + 540) % 360) - 180;
      const step = Math.sign(d) * Math.min(Math.abs(d), Math.min(10, warmShift));
      return { ...st, color: rgbToHex(gamutMapOklch([L, C, (h + step + 360) % 360])) };
    });
  }
  if (r.album && r.album.length >= 2) {
    // Dark → light, like every other palette.
    const album = r.album.slice(0, 6).sort((x, y) => srgbToOklch(hexToRgb(x))[0] - srgbToOklch(hexToRgb(y))[0]);
    s.stops = album.map((c, i) => ({ color: c, pos: i / (album.length - 1) }));
  }
  if (r.focus) s.speed = s.speed * 0.5;
  return normaliseState(s);
}
