/**
 * The Living Themes family: each is a painter over the shared sky (./sky.ts) plus its own
 * foreground, driven by the real Sun and Moon. All painters are pure and deterministic for a
 * given (frame, seed, size), which is what the tests and the parity gallery rely on.
 */
import type { RGB } from "../types";
import { addLight, blend, fillRow, hash01, pack, rgb } from "./pixel";
import {
  DEFAULT_LAYOUT,
  initSky,
  mixColour as mixc,
  paintSky,
  project,
  skyColours,
  sunColour,
  type Grade,
  type LivingFrame,
  type SkyColours,
  type SkyLayout,
  type SkyResult,
  type SkyState,
} from "./sky";

export interface LivingPainter {
  id: string;
  name: string;
  blurb: string;
  /** Sky colours after this theme's grade (the tint controller uses these). */
  grade?: Grade;
  init(w: number, h: number, seed: number): unknown;
  paint(px: Uint32Array, w: number, h: number, f: LivingFrame, state: unknown): SkyResult;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const gradeAll = (c: SkyColours, to: SkyColours, k: number): SkyColours => ({
  zenith: mixc(c.zenith, to.zenith, k),
  mid: mixc(c.mid, to.mid, k),
  horizon: mixc(c.horizon, to.horizon, k),
});
const scale = (c: RGB, k: number): RGB => rgb(c.r * k, c.g * k, c.b * k);
/** 0 at night .. 1 in daylight, from the Sun's altitude. */
const daylight = (f: LivingFrame) => smooth(-8, 10, f.sun.altitude);
/** Local solar time in hours (deterministic: no dependency on the machine's time zone). */
const solarHour = (f: LivingFrame) => ((((f.date.getTime() / 3_600_000 + f.longitude / 15) % 24) + 24) % 24);

/** Fills [x0, x1) on row y with one colour. */
function span(px: Uint32Array, w: number, y: number, x0: number, x1: number, c: number) {
  const a = Math.max(0, x0 | 0), b = Math.min(w, x1 | 0);
  if (a < b) px.fill(c, y * w + a, y * w + b);
}

// ---- 1. Sky ---------------------------------------------------------------------------------

export const skyPainter: LivingPainter = {
  id: "living-sky",
  name: "Sky",
  blurb: "The real sky outside: the Sun and Moon move with the time of day.",
  init: (_w, _h, seed) => initSky(seed),
  paint: (px, w, h, f, s) => paintSky(px, w, h, f, s as SkyState),
};

// ---- 2. Moonlight ---------------------------------------------------------------------------

/** Faint constellation hints: unit-box star positions and the lines between them. */
const CONSTELLATIONS: Record<string, { stars: [number, number][]; lines: [number, number][] }> = {
  orion: { stars: [[0.05, 0], [0.4, 0.06], [0.16, 0.42], [0.22, 0.45], [0.28, 0.48], [0.08, 0.88], [0.46, 0.82]], lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
  dipper: { stars: [[0, 0.12], [0.18, 0.06], [0.33, 0.14], [0.47, 0.22], [0.5, 0.45], [0.78, 0.48], [0.8, 0.24]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  cygnus: { stars: [[0.5, 0], [0.5, 0.36], [0.52, 0.92], [0.14, 0.24], [0.86, 0.46]], lines: [[0, 1], [1, 2], [3, 1], [1, 4]] },
  cassiopeia: { stars: [[0, 0.3], [0.22, 0.62], [0.45, 0.36], [0.68, 0.64], [0.92, 0.22]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  crux: { stars: [[0.5, 0], [0.48, 1], [0.12, 0.45], [0.82, 0.55], [0.62, 0.7]], lines: [[0, 1], [2, 3]] },
};

/** The constellation that rides high in the evening sky this month, for this hemisphere. */
export function constellationFor(date: Date, latitude: number): string {
  const m = date.getUTCMonth(); // 0 = Jan
  if (latitude < -10) return m >= 3 && m <= 8 ? "crux" : "orion";
  if (m === 11 || m <= 2) return "orion";
  if (m <= 5) return "dipper";
  if (m <= 8) return "cygnus";
  return "cassiopeia";
}

const moonGrade: Grade = (c, f) => {
  const day = daylight(f);
  const night: SkyColours = { zenith: rgb(6, 10, 28), mid: rgb(16, 26, 58), horizon: rgb(42, 56, 96) };
  const pale: SkyColours = { zenith: rgb(120, 146, 200), mid: rgb(176, 194, 228), horizon: rgb(222, 228, 242) };
  return gradeAll(c, day > 0.5 ? pale : night, 0.55);
};

export const moonlightPainter: LivingPainter = {
  id: "living-moonlight",
  name: "Moonlight",
  blurb: "A large Moon in tonight's real phase, with the season's constellation.",
  grade: moonGrade,
  init: (_w, _h, seed) => initSky(seed, 240),
  paint(px, w, h, f, s) {
    // Keep the Moon in view: its real azimuth sets the side of the screen, a pleasant height.
    const mp = project(Math.max(28, f.moon.altitude), f.moon.azimuth, f, w, h, DEFAULT_LAYOUT);
    const res = paintSky(px, w, h, f, s as SkyState, {
      grade: moonGrade,
      moonScale: 3.4,
      sunScale: 0.8,
      starScale: 1.15,
      moonAt: { x: Math.max(w * 0.2, Math.min(w * 0.8, mp.x)), y: Math.min(h * 0.36, mp.y) },
    });
    const vis = f.stars;
    if (vis > 0.15) {
      const c = CONSTELLATIONS[constellationFor(f.date, f.latitude)];
      // Opposite side from the Moon, upper part of the sky.
      const cx = res.moon.x > w / 2 ? w * 0.14 : w * 0.62;
      const cy = h * 0.12, size = h * 0.34;
      const pts = c.stars.map(([x, y]) => ({ x: cx + x * size, y: cy + y * size }));
      const a = (vis - 0.15) * 0.22;
      for (const [i, j] of c.lines) line(px, w, h, pts[i].x, pts[i].y, pts[j].x, pts[j].y, 170, 190, 240, a);
      const sr = Math.max(0.6, (1.6 * h) / 540);
      for (const p of pts) dot(px, w, h, p.x, p.y, sr, 235, 240, 255, Math.min(1, vis * 0.9));
    }
    return res;
  },
};

function line(px: Uint32Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = (x0 + ((x1 - x0) * i) / n) | 0, y = (y0 + ((y1 - y0) * i) / n) | 0;
    if (x >= 0 && x < w && y >= 0 && y < h) addLight(px, y * w + x, r, g, b, a);
  }
}

function dot(px: Uint32Array, w: number, h: number, cx: number, cy: number, r: number, cr: number, cg: number, cb: number, a: number, paint = false) {
  const R = Math.ceil(r + 1);
  for (let y = (cy - R) | 0; y <= cy + R; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = (cx - R) | 0; x <= cx + R; x++) {
      if (x < 0 || x >= w) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const k = clamp01(r + 0.5 - d);
      if (k > 0) {
        if (paint) blend(px, y * w + x, cr, cg, cb, a * k);
        else addLight(px, y * w + x, cr, cg, cb, a * k);
      }
    }
  }
}

// ---- 3. Seasons -----------------------------------------------------------------------------

export type Season = "spring" | "summer" | "autumn" | "winter";

/** Astronomical season for a date and hemisphere (equinoxes/solstices ≈ 20–21 Mar/Jun/Sep/Dec). */
export function seasonOf(date: Date, latitude: number): Season {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (date.getTime() - start) / 86_400_000;
  // 79 ≈ 20 March. Quarter boundaries at the equinoxes and solstices.
  let q = Math.floor((((doy - 79 + 365.25) % 365.25) / 365.25) * 4);
  if (latitude < 0) q = (q + 2) % 4;
  return (["spring", "summer", "autumn", "winter"] as const)[q];
}

const SEASON: Record<Season, { sky: SkyColours; ground: RGB; ground2: RGB; particle: RGB }> = {
  spring: { sky: { zenith: rgb(108, 150, 214), mid: rgb(196, 190, 226), horizon: rgb(250, 214, 222) }, ground: rgb(120, 168, 104), ground2: rgb(92, 140, 92), particle: rgb(255, 196, 214) },
  summer: { sky: { zenith: rgb(56, 132, 214), mid: rgb(126, 190, 236), horizon: rgb(236, 230, 190) }, ground: rgb(96, 152, 84), ground2: rgb(64, 120, 70), particle: rgb(255, 236, 150) },
  autumn: { sky: { zenith: rgb(98, 118, 170), mid: rgb(200, 164, 150), horizon: rgb(246, 196, 140) }, ground: rgb(178, 112, 58), ground2: rgb(140, 78, 46), particle: rgb(232, 132, 60) },
  winter: { sky: { zenith: rgb(118, 140, 178), mid: rgb(184, 196, 216), horizon: rgb(226, 232, 240) }, ground: rgb(226, 232, 240), ground2: rgb(196, 206, 222), particle: rgb(250, 252, 255) },
};

const seasonGrade: Grade = (c, f) => {
  const p = SEASON[seasonOf(f.date, f.latitude)];
  return gradeAll(c, p.sky, 0.4 * daylight(f));
};

interface SeasonState { sky: SkyState; hills: { a: number; f: number; p: number }[][]; parts: { x: number; y: number; s: number; ph: number }[] }

export const seasonsPainter: LivingPainter = {
  id: "living-seasons",
  name: "Seasons",
  blurb: "Blossom, summer haze, falling leaves or snow, by date and hemisphere.",
  grade: seasonGrade,
  init(_w, _h, seed) {
    const hills = [0, 1].map((l) => Array.from({ length: 3 }, (_, i) => ({ a: 0.5 + hash01(seed + l * 9 + i) * 0.5, f: (1 + i * 1.7 + hash01(seed * 3 + i + l) * 1.2) * Math.PI * 2, p: hash01(seed * 5 + i * 7 + l) * 6.28 })));
    const parts = Array.from({ length: 90 }, (_, i) => ({ x: hash01(seed * 7 + i), y: hash01(seed * 11 + i), s: 0.5 + hash01(seed * 13 + i), ph: hash01(seed * 17 + i) * 6.28 }));
    return { sky: initSky(seed), hills, parts } as SeasonState;
  },
  paint(px, w, h, f, state) {
    const s = state as SeasonState;
    const layout: SkyLayout = { horizon: 0.8, halfSpan: 150 };
    const res = paintSky(px, w, h, f, s.sky, { layout, grade: seasonGrade });
    const season = seasonOf(f.date, f.latitude);
    const P = SEASON[season];
    const day = daylight(f);
    const light = 0.14 + 0.86 * day;
    const warm = Math.max(0, 1 - Math.abs(f.sun.altitude - 2) / 10) * 0.25;
    const sc = sunColour(f.sun.altitude);
    const span01 = f.view.x1 - f.view.x0;
    s.hills.forEach((hill, l) => {
      const base = h * (l === 0 ? 0.78 : 0.86);
      const amp = h * (l === 0 ? 0.05 : 0.04);
      const g = mixc(scale(l === 0 ? mixc(P.ground, res.colours.horizon, 0.35) : P.ground2, light), sc, warm);
      const top = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const vx = f.view.x0 + (x / w) * span01;
        let y = 0;
        for (const k of hill) y += k.a * Math.sin(vx * k.f + k.p);
        top[x] = base - amp * y * 0.6;
      }
      // Precomputed shade ramp: lighter at the crest, settling 18 % darker below.
      const ramp = Math.max(1, (h * 0.15) | 0);
      const shades = new Uint32Array(ramp + 1);
      for (let i = 0; i <= ramp; i++) {
        const k = 1 - (0.18 * i) / ramp;
        shades[i] = pack(g.r * k, g.g * k, g.b * k);
      }
      for (let x = 0; x < w; x++) {
        const t = Math.max(0, top[x] | 0);
        for (let y = t; y < h; y++) px[y * w + x] = shades[y - t < ramp ? y - t : ramp];
      }
    });
    // Particles: petals, pollen (or fireflies at night), leaves, snow.
    const pc = season === "summer" && day < 0.4 ? rgb(210, 255, 140) : P.particle;
    const vis = season === "summer" ? (day < 0.4 ? 1 - day : 0.35) : 0.85;
    for (const p of s.parts) {
      const fall = season === "winter" ? 0.012 : season === "autumn" ? 0.009 : 0.004;
      const t = f.t * f.motion;
      const y = (((p.y + t * fall * p.s) % 1) + 1) % 1;
      const x = (((p.x + Math.sin(t * 0.4 * p.s + p.ph) * 0.01 + t * 0.002) % 1) + 1) % 1;
      const sx = ((x - f.view.x0) / span01) * w, sy = y * h;
      const flick = season === "summer" && day < 0.4 ? 0.5 + 0.5 * Math.sin(f.t * 2 * p.s + p.ph) : 1;
      const glow = season === "summer" && day < 0.4; // fireflies glow; petals, leaves and snow are painted
      const pcol = glow ? pc : scale(pc, 0.35 + 0.65 * light);
      dot(px, w, h, sx, sy, season === "winter" ? 1.2 * p.s : 1.1, pcol.r, pcol.g, pcol.b, (glow ? 0.55 : 0.8) * vis * flick, !glow);
    }
    return res;
  },
};

// ---- 4. Golden Hour -------------------------------------------------------------------------

/** 0..1, peaking at the real sunset (and, more gently, sunrise). */
export function goldenness(f: LivingFrame): number {
  const g = Math.exp(-(((f.sun.altitude - 1.5) / 5) ** 2));
  return g * (f.evening ? 1 : 0.5);
}

const goldenGrade: Grade = (c, f) => {
  const g = goldenness(f);
  const day = daylight(f);
  const amber: SkyColours = { zenith: rgb(116, 84, 138), mid: rgb(238, 146, 112), horizon: rgb(255, 196, 112) };
  const cream: SkyColours = { zenith: rgb(150, 170, 214), mid: rgb(222, 212, 222), horizon: rgb(248, 232, 210) };
  const plum: SkyColours = { zenith: rgb(18, 12, 30), mid: rgb(40, 24, 52), horizon: rgb(70, 40, 70) };
  let out = gradeAll(c, day > 0.5 ? cream : plum, 0.35);
  out = gradeAll(out, amber, 0.8 * g);
  return out;
};

export const goldenHourPainter: LivingPainter = {
  id: "living-golden-hour",
  name: "Golden Hour",
  blurb: "Calm cream by day; the screen turns amber and peaks at your real sunset.",
  grade: goldenGrade,
  init: (_w, _h, seed) => initSky(seed, 180),
  paint(px, w, h, f, s) {
    const res = paintSky(px, w, h, f, s as SkyState, { grade: goldenGrade, layout: { horizon: 0.9, halfSpan: 150 }, sunScale: 1.4, starScale: 0.7 });
    const g = goldenness(f);
    if (g > 0.05) {
      // Long rays fanning up from the low Sun: thin wedges, cheap to draw row by row.
      const sc = sunColour(f.sun.altitude);
      const sx = res.sun.x, sy = Math.min(res.sun.y, res.horizonY);
      const rays = 9;
      const u8 = new Uint8ClampedArray(px.buffer, px.byteOffset, px.length * 4);
      const rr = sc.r, rg = sc.g * 0.85, rb = sc.b * 0.7;
      for (let k = 0; k < rays; k++) {
        const ang = -Math.PI / 2 + (k - (rays - 1) / 2) * 0.24 + Math.sin(f.t * 0.05 * f.motion + k) * 0.015;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        if (dy >= -0.05) continue;
        const a0 = 0.06 * g * (0.6 + 0.4 * hash01(k * 31));
        for (let y = (sy | 0) - 1; y >= 0; y--) {
          const tdist = (sy - y) / -dy;
          const cx = sx + dx * tdist;
          const fade = 1 - tdist / (h * 0.85);
          if (fade <= 0) break;
          const half = 1 + tdist * 0.02;
          const x0 = Math.max(0, (cx - half) | 0), x1 = Math.min(w, (cx + half + 1) | 0);
          const a = a0 * fade;
          for (let q = (y * w + x0) << 2, e = (y * w + x1) << 2; q < e; q += 4) {
            u8[q] += rr * a;
            u8[q + 1] += rg * a;
            u8[q + 2] += rb * a;
          }
        }
      }
    }
    return res;
  },
};

// ---- 5. Weather Window ----------------------------------------------------------------------

const weatherGrade: Grade = (c, f) => {
  const grey = (k: number): SkyColours => ({ zenith: scale(rgb(130, 138, 150), k), mid: scale(rgb(160, 166, 176), k), horizon: scale(rgb(186, 190, 196), k) });
  const day = 0.18 + 0.82 * daylight(f);
  switch (f.weather) {
    case "cloudy": return gradeAll(c, grey(day), 0.5);
    case "rain": return gradeAll(c, grey(day * 0.8), 0.7);
    case "storm": return gradeAll(c, grey(day * 0.55), 0.8);
    case "snow": return gradeAll(c, grey(day * 1.05), 0.6);
    case "fog": return gradeAll(c, grey(day * 1.02), 0.75);
    default: return c;
  }
};

interface WeatherState { sky: SkyState; drops: { x: number; y: number; r: number; sp: number }[]; glass: { x: number; y: number; r: number }[] }

export const weatherPainter: LivingPainter = {
  id: "living-weather",
  name: "Weather Window",
  blurb: "The sky through a window, with your weather. Online weather is opt-in.",
  grade: weatherGrade,
  init(_w, _h, seed) {
    const drops = Array.from({ length: 260 }, (_, i) => ({ x: hash01(seed + i * 3), y: hash01(seed * 7 + i * 3), r: hash01(seed * 9 + i), sp: 0.6 + hash01(seed * 13 + i) * 0.6 }));
    const glass = Array.from({ length: 46 }, (_, i) => ({ x: hash01(seed * 17 + i), y: hash01(seed * 19 + i), r: 0.6 + hash01(seed * 23 + i) * 1.6 }));
    return { sky: initSky(seed), drops, glass } as WeatherState;
  },
  paint(px, w, h, f, state) {
    const s = state as WeatherState;
    const kind = f.weather;
    const cover = kind === "clear" ? 0 : kind === "fog" ? 0.3 : 1;
    const res = paintSky(px, w, h, f, s.sky, { grade: weatherGrade, cloudCover: cover, starScale: kind === "clear" ? 1 : 0.15, sunScale: kind === "clear" ? 1 : 0.6 });
    const day = daylight(f);
    if (kind === "fog") {
      const fog = mixc(res.colours.horizon, rgb(200, 204, 210), 0.4 * day);
      for (let y = (h * 0.35) | 0; y < h; y++) {
        const k = smooth(0.35, 1, y / h) * 0.6;
        const o = y * w;
        for (let x = 0; x < w; x += 1) blend(px, o + x, fog.r, fog.g, fog.b, k);
      }
    }
    const t = f.t * f.motion;
    if (kind === "rain" || kind === "storm") {
      const len = h * 0.03;
      for (const d of s.drops) {
        const y = ((d.y + t * 0.45 * d.sp) % 1) * h;
        const x = ((d.x + (y / h) * 0.05) % 1) * w;
        line(px, w, h, x, y, x - len * 0.15, y + len * d.sp, 200, 210, 225, 0.1 + 0.1 * d.r);
      }
      // Drops resting on the glass.
      for (const g of s.glass) dot(px, w, h, g.x * w, g.y * h, g.r * (h / 400), 220, 228, 240, 0.25);
    }
    if (kind === "snow") {
      for (const d of s.drops) {
        const y = ((d.y + t * 0.05 * d.sp) % 1) * h;
        const x = (((d.x + Math.sin(t * 0.5 * d.sp + d.r * 6) * 0.01) % 1) + 1) % 1 * w;
        dot(px, w, h, x, y, 0.8 + d.r * 1.2, 250, 252, 255, 0.6);
      }
    }
    if (kind === "storm" && f.motion > 0) {
      // A rare, soft flash (deterministic in t), never a strobe: at most one ~0.3 s flash per 9 s.
      const slot = Math.floor(f.t / 9);
      const ph = f.t / 9 - slot;
      if (hash01(slot * 97) > 0.6 && ph < 0.035) {
        const k = 0.12 * (1 - ph / 0.035);
        for (let i = 0; i < w * h; i++) addLight(px, i, 220, 226, 255, k);
      }
    }
    // Window frame: soft vignette bars (a mullion) so it reads as a window, not a photo.
    const frame = scale(mixc(res.colours.zenith, rgb(20, 22, 28), 0.7), 0.6 + 0.4 * day);
    const bar = Math.max(2, (w * 0.008) | 0);
    const fc = pack(frame.r, frame.g, frame.b);
    for (let y = 0; y < h; y++) span(px, w, y, w / 2 - bar / 2, w / 2 + bar / 2, fc);
    for (let y = (h * 0.5 - bar / 2) | 0; y < h * 0.5 + bar / 2; y++) span(px, w, y, 0, w, fc);
    return res;
  },
};

// ---- 6. Tides of Light ----------------------------------------------------------------------

/**
 * Semidiurnal tide from the Moon: high water about when the Moon is on the meridian (above or
 * below), larger at new and full Moon (spring tides). −1 low .. 1 high. A toy model, not a tide table.
 */
export function tideLevel(f: LivingFrame): number {
  const amp = 0.72 + 0.28 * Math.cos(4 * Math.PI * f.moon.phase);
  return amp * Math.cos((2 * f.moon.hourAngle * Math.PI) / 180);
}

export const tidesPainter: LivingPainter = {
  id: "living-tides",
  name: "Tides of Light",
  blurb: "A sea horizon that mirrors the sky; the shore follows the Moon's tide.",
  init: (_w, _h, seed) => initSky(seed),
  paint(px, w, h, f, s) {
    const layout: SkyLayout = { horizon: 0.6, halfSpan: 150 };
    const res = paintSky(px, w, h, f, s as SkyState, { layout });
    const hy = res.horizonY | 0;
    const C = res.colours;
    const tide = tideLevel(f);
    const shore = h * (0.9 - 0.045 * tide);
    const day = daylight(f);
    const sand = scale(rgb(214, 196, 168), 0.2 + 0.8 * day);
    const t = f.t * f.motion;
    for (let y = hy; y < h; y++) {
      const d = (y - hy) / (h - hy);
      // Water reflects the sky: horizon colour near the horizon, the zenith colour close in.
      const wc = scale(mixc(C.horizon, C.zenith, Math.sqrt(d)), 0.78 - 0.18 * d);
      const wave = Math.sin(y * 0.9 + t * 0.6) * 0.5;
      const sy = shore + Math.sin(t * 0.35) * h * 0.006 + wave;
      if (y < sy) fillRow(px, w, y, wc.r, wc.g, wc.b);
      else if (y < sy + 2) {
        const foam = 0.3 + 0.7 * day;
        fillRow(px, w, y, 226 * foam, 232 * foam, 238 * foam);
      }
      else fillRow(px, w, y, sand.r * (1 - 0.1 * d), sand.g * (1 - 0.1 * d), sand.b * (1 - 0.1 * d));
    }
    // Glitter path under the Sun or the Moon.
    const src = res.sun.visible ? { x: res.sun.x, c: sunColour(f.sun.altitude), k: 0.6 } : res.moon.visible ? { x: res.moon.x, c: rgb(230, 234, 250), k: 0.35 * f.moon.illumination } : null;
    if (src && src.k > 0.02) {
      const frame = Math.floor(t * 3);
      for (let y = hy + 1; y < Math.min(h, shore); y++) {
        const d = (y - hy) / (h - hy);
        const half = w * (0.01 + 0.09 * d);
        const x0 = Math.max(0, (src.x - half) | 0), x1 = Math.min(w, (src.x + half) | 0);
        for (let x = x0; x < x1; x++) {
          const r = hash01(x * 73856093 ^ y * 19349663 ^ frame * 83492791);
          if (r > 0.93) {
            const fall = 1 - Math.abs(x - src.x) / half;
            addLight(px, y * w + x, src.c.r, src.c.g, src.c.b, src.k * fall * (r - 0.93) * 14);
          }
        }
      }
    }
    return res;
  },
};

// ---- 7. City Night --------------------------------------------------------------------------

interface Building { x0: number; x1: number; top: number; layer: number; id: number }

/** Share of windows lit: off by day, filling after sunset, thinning after midnight, a few at dawn. */
export function windowsLit(f: LivingFrame): number {
  const dark = smooth(4, -6, f.sun.altitude);
  const hr = solarHour(f);
  // Evening ~0.7, past midnight falling to ~0.15 by 3 am, early risers ~0.3 before dawn.
  let occ: number;
  if (hr >= 17 || hr < 0.5) occ = 0.72;
  else if (hr < 3.5) occ = 0.72 - (0.57 * (hr - 0.5)) / 3;
  else if (hr < 6) occ = 0.15 + (0.15 * (hr - 3.5)) / 2.5;
  else occ = 0.3;
  return dark * occ;
}

export const cityNightPainter: LivingPainter = {
  id: "living-city-night",
  name: "City Night",
  blurb: "A skyline whose windows light up after your sunset.",
  init(w, h, seed) {
    const out: Building[] = [];
    for (let layer = 0; layer < 2; layer++) {
      let x = -0.02;
      let id = layer * 1000;
      while (x < 1.02) {
        const bw = (layer === 0 ? 0.035 : 0.05) + hash01(seed * 3 + id) * (layer === 0 ? 0.04 : 0.06);
        const top = layer === 0 ? 0.48 + hash01(seed * 5 + id) * 0.18 : 0.6 + hash01(seed * 7 + id) * 0.2;
        out.push({ x0: x, x1: x + bw, top, layer, id });
        x += bw + (layer === 0 ? 0.002 : 0.004);
        id++;
      }
    }
    return { sky: initSky(seed), buildings: out, w, h };
  },
  paint(px, w, h, f, state) {
    const s = state as { sky: SkyState; buildings: Building[] };
    const res = paintSky(px, w, h, f, s.sky, { layout: { horizon: 0.97, halfSpan: 150 }, starScale: 0.45 });
    const day = daylight(f);
    const lit = windowsLit(f);
    const C = res.colours;
    const span01 = f.view.x1 - f.view.x0;
    const cell = Math.max(3, Math.round(h / 90));
    for (const b of s.buildings) {
      const bx0 = ((b.x0 - f.view.x0) / span01) * w, bx1 = ((b.x1 - f.view.x0) / span01) * w;
      if (bx1 < 0 || bx0 > w) continue;
      const top = b.top * h;
      const body = b.layer === 0 ? mixc(scale(C.horizon, 0.5), rgb(30, 34, 50), 0.55) : mixc(scale(C.mid, 0.35), rgb(14, 16, 26), 0.6);
      const bc = scale(body, 0.35 + 0.65 * day);
      const c = pack(bc.r, bc.g, bc.b);
      for (let y = top | 0; y < h; y++) span(px, w, y, bx0, bx1, c);
      // Windows on a grid with margins; each has its own threshold so the city fills gradually.
      const cols = Math.floor((bx1 - bx0 - cell) / (cell * 2));
      const rows = Math.floor((h - top - cell * 2) / (cell * 2.4));
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const hsh = hash01(b.id * 7919 + r * 131 + k * 17);
          const wx = bx0 + cell + k * cell * 2, wy = top + cell + r * cell * 2.4;
          let wr: number, wg: number, wb: number, a: number;
          if (hsh < lit) {
            const cool = hash01(b.id * 31 + r * 7 + k) > 0.8;
            wr = cool ? 190 : 255; wg = cool ? 220 : 206; wb = cool ? 255 : 140;
            a = 0.85 * (0.6 + 0.4 * hash01(b.id + r + k * 3));
          } else {
            // Unlit by day: glass reflects the sky a little.
            const rc = mixc(C.mid, rgb(255, 255, 255), 0.1);
            wr = rc.r; wg = rc.g; wb = rc.b;
            a = 0.18 * day + 0.04;
          }
          for (let yy = wy | 0; yy < wy + cell * 1.3 && yy < h; yy++) {
            for (let xx = Math.max(0, wx | 0); xx < wx + cell && xx < w; xx++) blend(px, yy * w + xx, wr, wg, wb, a);
          }
        }
      }
    }
    return res;
  },
};

// ---- 8. Northern Lights ---------------------------------------------------------------------

const auroraGrade: Grade = (c, f) => {
  const night: SkyColours = { zenith: rgb(3, 10, 20), mid: rgb(6, 22, 36), horizon: rgb(16, 40, 56) };
  const arctic: SkyColours = { zenith: rgb(126, 160, 206), mid: rgb(178, 204, 228), horizon: rgb(222, 232, 240) };
  return gradeAll(c, daylight(f) > 0.5 ? arctic : night, 0.5);
};

/** Aurora strength: night only, stronger towards the poles (always a little, it's a theme). */
export function auroraStrength(f: LivingFrame): number {
  const polar = clamp01((Math.abs(f.latitude) - 40) / 28);
  return f.stars * (0.55 + 0.45 * polar);
}

export const northernLightsPainter: LivingPainter = {
  id: "living-aurora",
  name: "Northern Lights",
  blurb: "Green curtains on dark nights over snowy peaks; pale arctic blue by day.",
  grade: auroraGrade,
  init(w, _h, seed) {
    const peaks = Array.from({ length: 5 }, (_, i) => ({ f: (2 + i * 2.3 + hash01(seed + i) * 2) * Math.PI, p: hash01(seed * 3 + i) * 6.28, a: 1 / (1 + i * 0.8) }));
    return { sky: initSky(seed), peaks, col: new Float32Array(w * 4) };
  },
  paint(px, w, h, f, state) {
    const s = state as { sky: SkyState; peaks: { f: number; p: number; a: number }[]; col: Float32Array; ridge?: Float32Array };
    // Snowy peaks' ridge first: rows below its lowest point need no sky.
    const span0 = f.view.x1 - f.view.x0;
    if (!s.ridge || s.ridge.length < w) s.ridge = new Float32Array(w);
    const top = s.ridge;
    let covered = 0;
    for (let x = 0; x < w; x++) {
      const vx = f.view.x0 + (x / w) * span0;
      let y = 0;
      // 1 − |sin| gives sharp summits and rounded valleys.
      for (const p of s.peaks) y += p.a * (1 - Math.abs(Math.sin(vx * p.f * 0.5 + p.p)));
      top[x] = h * 0.84 - h * 0.15 * y + h * 0.08;
      if (top[x] > covered) covered = top[x];
    }
    const res = paintSky(px, w, h, f, s.sky, { grade: auroraGrade, layout: { horizon: 0.84, halfSpan: 150 }, clipBottom: covered + 1 });
    const I = auroraStrength(f);
    const hy = res.horizonY;
    const span01 = f.view.x1 - f.view.x0;
    const t = f.t * f.motion;
    if (I > 0.03) {
      if (s.col.length < w * 4) s.col = new Float32Array(w * 4);
      const u8 = new Uint8ClampedArray(px.buffer, px.byteOffset, px.length * 4);
      for (let x = 0; x < w; x++) {
        const vx = f.view.x0 + (x / w) * span01;
        const n1 = Math.sin(vx * 7.1 + t * 0.03) * 0.5 + Math.sin(vx * 13.7 - t * 0.05 + 1.3) * 0.3 + Math.sin(vx * 3.3 + 2.1) * 0.2;
        const n2 = Math.sin(vx * 23.0 + t * 0.07) * 0.5 + 0.5;
        const bot = hy * (0.5 + 0.12 * n1); // curtain bottom
        const ht = hy * (0.22 + 0.14 * n2); // height
        s.col[x * 4] = bot - ht; // curtain top
        s.col[x * 4 + 1] = 1 / ht;
        // Strength with vertical ray striations folded in.
        s.col[x * 4 + 2] = I * clamp01(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(vx * 5.3 + t * 0.02 + n1))) * (0.72 + 0.28 * Math.sin(x * 0.45 + t * 0.15)) * 0.7;
        s.col[x * 4 + 3] = bot + ht * 0.12;
      }
      // Column-major: each curtain column only touches its own rows.
      for (let x = 0; x < w; x++) {
        const c0 = s.col[x * 4], inv = s.col[x * 4 + 1], str = s.col[x * 4 + 2];
        if (str < 0.01) continue;
        const yEnd = Math.min(hy, s.col[x * 4 + 3]);
        for (let y = Math.max(0, c0 | 0); y < yEnd; y++) {
          const v = (y - c0) * inv;
          if (v <= 0) continue;
          const body = v <= 1 ? v * v : 1 - (v - 1) / 0.12;
          const k = str * body;
          if (k < 0.01) continue;
          // Green low, violet up top.
          const top = v < 1 ? 1 - v : 0;
          const q = (y * w + x) << 2;
          u8[q] += (60 + 120 * top) * k;
          u8[q + 1] += (230 - 150 * top) * k;
          u8[q + 2] += (140 + 80 * top) * k;
        }
      }
    }
    // Snowy peaks.
    const day = daylight(f);
    const snow = scale(mixc(rgb(232, 238, 246), res.colours.horizon, 0.25), 0.18 + 0.82 * day);
    const shade = scale(mixc(rgb(150, 170, 200), res.colours.zenith, 0.4), 0.15 + 0.85 * day);
    // Lit faces turn towards the Sun's side of the screen (low light from the left or right).
    const facing = f.latitude >= f.sun.declination ? 180 : 0;
    const rel = ((((f.sun.azimuth - facing) % 360) + 540) % 360) - 180;
    const dir = rel > 0 ? -1 : 1;
    // Faces lit/shaded near the ridge (snow caps), fading into one even body colour below,
    // so the range reads as a silhouette rather than vertical stripes.
    const body = mixc(shade, scale(res.colours.zenith, 0.5 + 0.3 * day), 0.4);
    const band = h * 0.12;
    for (let x = 0; x < w; x++) {
      const sl = (top[Math.min(w - 1, x + 2)] - top[Math.max(0, x - 2)]) * dir;
      const cap = mixc(shade, snow, 0.5 + 0.5 * Math.tanh(sl * 0.2));
      const y0 = Math.max(0, top[x] | 0);
      for (let yy = y0; yy < h; yy++) {
        const k = (yy - top[x]) / band;
        if (k >= 1) {
          const bp = pack(body.r, body.g, body.b);
          for (let y2 = yy; y2 < h; y2++) px[y2 * w + x] = bp;
          break;
        }
        const e = k * k;
        px[yy * w + x] = pack(cap.r + (body.r - cap.r) * e, cap.g + (body.g - cap.g) * e, cap.b + (body.b - cap.b) * e);
      }
    }
    return res;
  },
};

// ---- 9. Desert Day --------------------------------------------------------------------------

const desertGrade: Grade = (c, f) => {
  const dusty: SkyColours = { zenith: rgb(66, 120, 200), mid: rgb(150, 182, 220), horizon: rgb(238, 214, 182) };
  return gradeAll(c, dusty, 0.4 * daylight(f));
};

export const desertPainter: LivingPainter = {
  id: "living-desert",
  name: "Desert Day",
  blurb: "Dunes whose shadows follow the real Sun's direction and height.",
  grade: desertGrade,
  init(w, _h, seed) {
    const layers = Array.from({ length: 4 }, (_, l) => ({ base: 0.66 + l * 0.085, amp: 0.035 + l * 0.012, f: (3.2 - l * 0.5) * 2 * Math.PI, p: hash01(seed + l * 7) * 6.28, skew: 0.55 + hash01(seed * 3 + l) * 0.25 }));
    return { sky: initSky(seed), layers, tops: new Float32Array(w * 4) };
  },
  paint(px, w, h, f, state) {
    const s = state as { sky: SkyState; layers: { base: number; amp: number; f: number; p: number; skew: number }[]; tops: Float32Array; lit?: Float32Array; cols?: Float32Array };
    const nL = s.layers.length;
    if (s.tops.length < w * nL) s.tops = new Float32Array(w * nL);
    const span0 = f.view.x1 - f.view.x0;
    // All ridge lines first, so each layer only fills down to the one in front of it.
    s.layers.forEach((L, li) => {
      for (let x = 0; x < w; x++) {
        const vx = f.view.x0 + (x / w) * span0;
        const ph = (vx * L.f + L.p) / (2 * Math.PI);
        const fr = ph - Math.floor(ph);
        // Asymmetric dune: long windward slope, short steep slip face.
        const prof = fr < L.skew ? fr / L.skew : 1 - (fr - L.skew) / (1 - L.skew);
        s.tops[li * w + x] = h * (L.base - L.amp * (prof * prof * (3 - 2 * prof)));
      }
    });
    // Rows every column's dunes cover need no sky.
    let covered = 0;
    for (let x = 0; x < w; x++) {
      let m = h;
      for (let li = 0; li < nL; li++) m = Math.min(m, s.tops[li * w + x]);
      covered = Math.max(covered, m);
    }
    const res = paintSky(px, w, h, f, s.sky, { grade: desertGrade, layout: { horizon: 0.66, halfSpan: 150 }, clipBottom: covered + 1 });
    const day = daylight(f);
    const alt = Math.max(0.5, f.sun.altitude);
    // Sun direction on screen: which side the light comes from, and how flat it is.
    const facing = f.latitude >= f.sun.declination ? 180 : 0;
    const rel = ((((f.sun.azimuth - facing) % 360) + 540) % 360) - 180;
    const fromRight = rel > 0;
    const side = Math.abs(Math.sin((rel * Math.PI) / 180)); // 0 = sun straight ahead/behind
    const sc = sunColour(f.sun.altitude);
    const litSand = mixc(rgb(238, 196, 136), sc, 0.25 * Math.max(0, 1 - f.sun.altitude / 15));
    const shadowSand = mixc(rgb(150, 104, 96), res.colours.zenith, 0.35);
    const tanA = Math.tan((alt * Math.PI) / 180) * (h / w) * 3; // screen-space shadow slope
    if (!s.cols || s.cols.length < w * nL * 3) s.cols = new Float32Array(w * nL * 3);
    if (!s.lit || s.lit.length < w) s.lit = new Float32Array(w);
    const bodies: RGB[] = [];
    const bands: number[] = [];
    s.layers.forEach((L, li) => {
      const haze = (3 - li) / 3 * 0.55; // far dunes fade into the horizon haze
      bands.push(h * L.amp * 1.6);
      bodies.push(mixc(scale(mixc(shadowSand, litSand, 0.5), 0.3 + 0.7 * day), res.colours.horizon, haze * (0.5 + 0.5 * day)));
      const top = s.tops.subarray(li * w, li * w + w);
      // Shadow sweep away from the Sun: a column is shadowed when the line from the last crest drops below it.
      const lit = s.lit!;
      let line = Infinity;
      for (let i = 0; i < w; i++) {
        const x = fromRight ? w - 1 - i : i;
        // 1 = in light, 0 = deep in a crest's shadow, soft over a few pixels.
        lit[x] = 1 - clamp01((top[x] - (line + tanA)) / 4);
        line = Math.min(top[x], line + tanA);
      }
      for (let x = 0; x < w; x++) {
        const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x;
        const slope = (top[xr] - top[xl]) / 2; // >0: surface drops to the right
        const faceSun = fromRight ? -slope : slope; // facing the Sun's side
        let k = 0.55 + 0.45 * Math.tanh(faceSun * 0.8) * side;
        k = k * lit[x] + Math.min(k, 0.38) * (1 - lit[x]);
        k = clamp01(k * (0.25 + 0.75 * day));
        const lk = 0.3 + 0.7 * day, hz = haze * (0.5 + 0.5 * day);
        const o = (li * w + x) * 3;
        s.cols![o] = (shadowSand.r + (litSand.r - shadowSand.r) * k) * lk * (1 - hz) + res.colours.horizon.r * hz;
        s.cols![o + 1] = (shadowSand.g + (litSand.g - shadowSand.g) * k) * lk * (1 - hz) + res.colours.horizon.g * hz;
        s.cols![o + 2] = (shadowSand.b + (litSand.b - shadowSand.b) * k) * lk * (1 - hz) + res.colours.horizon.b * hz;
      }
    });
    // Each layer fills from its ridge down to the ridge of the layer in front. The lit/shaded
    // face fades into the layer's even body colour below the ridge, so narrow slope changes
    // don't become vertical stripes. Colours are mixes of in-range colours: no clamping needed.
    const cols = s.cols, tops = s.tops;
    for (let li = 0; li < nL; li++) {
      const B = bodies[li], bp = pack(B.r, B.g, B.b), ib = 1 / bands[li];
      for (let x = 0; x < w; x++) {
        const t0 = tops[li * w + x];
        const yEnd = li + 1 < nL ? Math.min(h, Math.ceil(tops[(li + 1) * w + x])) : h;
        const q = (li * w + x) * 3;
        const cr = cols[q], cg = cols[q + 1], cb = cols[q + 2];
        const dr = B.r - cr, dg = B.g - cg, db = B.b - cb;
        const y0 = Math.max(0, t0 | 0);
        const yb = Math.min(yEnd, (t0 + bands[li]) | 0);
        let o = y0 * w + x;
        for (let y = y0; y < yb; y++, o += w) {
          const e = (y - t0) * ib, ee = e * e;
          px[o] = (0xff000000 | (((cb + db * ee) | 0) << 16) | (((cg + dg * ee) | 0) << 8) | ((cr + dr * ee) | 0)) >>> 0;
        }
        for (let y = Math.max(yb, y0); y < yEnd; y++, o += w) px[o] = bp;
      }
    }
    return res;
  },
};

export const LIVING_PAINTERS: LivingPainter[] = [
  skyPainter,
  moonlightPainter,
  seasonsPainter,
  goldenHourPainter,
  weatherPainter,
  tidesPainter,
  cityNightPainter,
  northernLightsPainter,
  desertPainter,
];

export function painterById(id: string): LivingPainter | undefined {
  return LIVING_PAINTERS.find((p) => p.id === id);
}

/** The sky colours a theme shows right now (after its grade). Used by the tint controller. */
export function themeColours(p: LivingPainter, f: LivingFrame): SkyColours {
  const c = skyColours(f.sun.altitude, f.evening);
  return p.grade ? p.grade(c, f) : c;
}
