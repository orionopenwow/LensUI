/**
 * The shared sky of every Living Theme: a stylised Rayleigh gradient driven by the real solar
 * altitude, the Sun disc with bloom, the Moon with its real phase, twinkling stars that come out
 * by twilight stage, and optional slow high clouds. Family themes call `paintSky` with their own
 * colour grade and horizon, then draw their foreground on top.
 */
import type { RGB } from "../types";
import { moonState, skyStage, starVisibility, sunPosition, type MoonState, type SkyStage, type SunPosition } from "./astro";
import { BAYER, addLight, blend, fillRow, hash01, pack, rgb } from "./pixel";

export type WeatherKind = "clear" | "cloudy" | "rain" | "snow" | "fog" | "storm";

export interface LivingInputs {
  date: Date;
  latitude: number;
  longitude: number;
  /** Animation clock, seconds (twinkle, drift). Independent of `date` so time-lapses stay smooth. */
  t: number;
  /** 0 = still frame, 1 = subtle motion. */
  motion: number;
  clouds: boolean;
  weather: WeatherKind;
  /** Part of a wider virtual canvas this screen shows (multi-monitor continuous sky). */
  view: { x0: number; x1: number };
}

export interface LivingFrame extends LivingInputs {
  sun: SunPosition;
  moon: MoonState;
  stage: SkyStage;
  /** 0..1, how visible the stars are. */
  stars: number;
  /** True after solar noon (the Sun is heading down). */
  evening: boolean;
}

export function makeFrame(i: LivingInputs): LivingFrame {
  const sun = sunPosition(i.date, i.latitude, i.longitude);
  const moon = moonState(i.date, i.latitude, i.longitude);
  // Evening = hour angle positive: the Sun's azimuth has passed the meridian it culminates on.
  const facing = i.latitude >= sun.declination ? 180 : 0;
  const rel = (((sun.azimuth - facing) % 360) + 540) % 360 - 180;
  return { ...i, sun, moon, stage: skyStage(sun.altitude), stars: starVisibility(sun.altitude), evening: rel > 0 };
}

// ---- Colour ---------------------------------------------------------------------------------

export interface SkyColours {
  zenith: RGB;
  mid: RGB;
  horizon: RGB;
}

/**
 * Keyframes by solar altitude (degrees). Hand-tuned to the "Sky" reference: navy night with
 * faint stars, violet-pink nautical twilight, orange sunrise, lavender-blue day. Between keys the
 * colours are interpolated; the shape (bluer zenith, whiter/warmer horizon) is the stylised
 * Rayleigh part.
 */
const KEYS: { alt: number; c: [number[], number[], number[]] }[] = [
  { alt: -90, c: [[3, 5, 15], [6, 10, 26], [11, 16, 38]] },
  { alt: -18, c: [[5, 8, 24], [10, 16, 40], [20, 27, 60]] },
  { alt: -12, c: [[10, 16, 42], [24, 32, 76], [50, 50, 96]] },
  { alt: -6, c: [[24, 32, 82], [66, 62, 128], [148, 98, 140]] },
  { alt: -3, c: [[38, 50, 110], [118, 94, 160], [228, 128, 130]] },
  { alt: 0, c: [[54, 72, 138], [162, 126, 176], [252, 158, 110]] },
  { alt: 3, c: [[70, 96, 166], [194, 158, 190], [255, 184, 122]] },
  { alt: 8, c: [[90, 122, 198], [176, 174, 226], [250, 212, 178]] },
  { alt: 20, c: [[102, 136, 220], [160, 176, 238], [220, 214, 240]] },
  { alt: 45, c: [[92, 134, 230], [150, 180, 246], [206, 220, 250]] },
  { alt: 90, c: [[80, 128, 234], [140, 176, 248], [196, 216, 252]] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixc = (a: RGB, b: RGB, t: number): RGB => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });

export function skyColours(altitude: number, evening = false): SkyColours {
  let i = 0;
  while (i < KEYS.length - 2 && altitude > KEYS[i + 1].alt) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t0 = Math.max(0, Math.min(1, (altitude - a.alt) / (b.alt - a.alt)));
  const t = t0 * t0 * (3 - 2 * t0);
  const pick = (k: number): RGB => rgb(lerp(a.c[k][0], b.c[k][0], t), lerp(a.c[k][1], b.c[k][1], t), lerp(a.c[k][2], b.c[k][2], t));
  const out = { zenith: pick(0), mid: pick(1), horizon: pick(2) };
  // Evenings run a touch pinker than mornings (more aerosol after a day's heating).
  if (evening && altitude > -8 && altitude < 10) {
    const k = 1 - Math.abs(altitude - 1) / 9;
    out.horizon = mixc(out.horizon, rgb(250, 120, 140), 0.18 * Math.max(0, k));
    out.mid = mixc(out.mid, rgb(176, 110, 170), 0.12 * Math.max(0, k));
  }
  return out;
}

/** Colour of the Sun's disc and its light, by altitude. */
export function sunColour(altitude: number): RGB {
  const t = Math.max(0, Math.min(1, (altitude + 1) / 14));
  return mixc(rgb(255, 118, 58), rgb(255, 248, 232), t * t * (3 - 2 * t));
}

/** A grade is applied to the three sky colours (family themes shift the palette). */
export type Grade = (c: SkyColours, f: LivingFrame) => SkyColours;

// ---- Projection -----------------------------------------------------------------------------

export interface SkyLayout {
  /** Horizon line, fraction of height from the top. */
  horizon: number;
  /** Half the azimuth span across the whole virtual canvas, degrees. */
  halfSpan: number;
}

export const DEFAULT_LAYOUT: SkyLayout = { horizon: 0.94, halfSpan: 150 };

/** Screen position (pixels) of a sky object. The view faces the meridian the Sun culminates on. */
export function project(alt: number, az: number, f: LivingFrame, w: number, h: number, L: SkyLayout): { x: number; y: number } {
  const facing = f.latitude >= f.sun.declination ? 180 : 0;
  const rel = (((az - facing) % 360) + 540) % 360 - 180;
  const vx = 0.5 + rel / (2 * L.halfSpan);
  const sx = (vx - f.view.x0) / Math.max(1e-6, f.view.x1 - f.view.x0);
  const y = L.horizon * (1 - 0.95 * Math.sin((alt * Math.PI) / 180));
  return { x: sx * w, y: y * h };
}

// ---- Painter --------------------------------------------------------------------------------

export interface Star {
  /** Virtual-canvas x (0..1, wraps with sidereal time) and height above the horizon (0..1). */
  x: number;
  y: number;
  mag: number;
  tw: number;
}

export interface SkyState {
  stars: Star[];
  clouds: { x: number; y: number; a: number; b: number; sp: number; k: number }[];
}

export function initSky(seed: number, nStars = 320): SkyState {
  const stars: Star[] = [];
  for (let i = 0; i < nStars; i++) {
    const r = hash01(seed * 7919 + i * 4);
    stars.push({
      x: hash01(seed * 31 + i * 4 + 1),
      // More stars high up than near the hazy horizon.
      y: Math.sqrt(hash01(seed * 131 + i * 4 + 2)),
      mag: r * r * r,
      tw: hash01(seed * 17 + i * 4 + 3) * Math.PI * 2,
    });
  }
  const clouds = Array.from({ length: 7 }, (_, i) => ({
    x: hash01(seed * 3 + i * 11),
    y: 0.18 + hash01(seed * 5 + i * 13) * 0.45,
    a: 0.12 + hash01(seed * 7 + i * 17) * 0.2,
    b: 0.012 + hash01(seed * 9 + i * 19) * 0.018,
    sp: 0.002 + hash01(seed * 11 + i * 23) * 0.003,
    k: 0.5 + hash01(seed * 13 + i * 29) * 0.5,
  }));
  return { stars, clouds };
}

export interface SkyPaintOptions {
  layout?: SkyLayout;
  grade?: Grade;
  /** Multipliers for the Sun and Moon disc size. */
  sunScale?: number;
  moonScale?: number;
  /** Override where the Moon is drawn (Moonlight keeps it in view). */
  moonAt?: { x: number; y: number } | null;
  starScale?: number;
  /** Clouds' cover (0..1); the clouds option and weather raise it. */
  cloudCover?: number;
  /** Rows from here down are covered by the theme's foreground: skip painting them. */
  clipBottom?: number;
}

export interface SkyResult {
  colours: SkyColours;
  sun: { x: number; y: number; r: number; visible: boolean };
  moon: { x: number; y: number; r: number; visible: boolean };
  horizonY: number;
}

/** Paints the whole sky into `px`. Returns where things ended up, for foreground layers. */
export function paintSky(px: Uint32Array, w: number, h: number, f: LivingFrame, s: SkyState, o: SkyPaintOptions = {}): SkyResult {
  const L = o.layout ?? DEFAULT_LAYOUT;
  let col = skyColours(f.sun.altitude, f.evening);
  if (o.grade) col = o.grade(col, f);
  const hy = L.horizon * h;
  const yLim = Math.max(1, Math.min(h, Math.ceil(o.clipBottom ?? h)));

  // 1. Vertical gradient, row by row (dithered).
  const { zenith: Z, mid: M, horizon: H } = col;
  for (let y = 0; y < yLim; y++) {
    const v = Math.min(1, y / hy);
    let r: number, g: number, b: number;
    if (v < 0.62) {
      const t = v / 0.62;
      const e = t * t;
      r = Z.r + (M.r - Z.r) * e; g = Z.g + (M.g - Z.g) * e; b = Z.b + (M.b - Z.b) * e;
    } else {
      const t = (v - 0.62) / 0.38;
      const e = t * (2 - t);
      r = M.r + (H.r - M.r) * e; g = M.g + (H.g - M.g) * e; b = M.b + (H.b - M.b) * e;
    }
    if (y > hy) {
      // Below the horizon line: the haze darkens slightly (only visible on low-horizon themes).
      const k = Math.min(1, (y - hy) / (h * 0.2));
      r *= 1 - 0.18 * k; g *= 1 - 0.18 * k; b *= 1 - 0.12 * k;
    }
    fillRow(px, w, y, r, g, b);
  }

  // 2. Stars (they rotate with local sidereal time across the virtual canvas).
  const starVis = f.stars * (o.starScale ?? 1);
  if (starVis > 0.01) {
    const lstTurns = (f.date.getTime() / 86_164_090.5 + f.longitude / 360) % 1;
    const span = f.view.x1 - f.view.x0;
    // Same density on any canvas: small previews draw a deterministic subset of the stars.
    const count = Math.max(24, Math.min(s.stars.length, Math.round((s.stars.length * w * h) / (960 * 540 * span))));
    for (let si = 0; si < count; si++) {
      const st = s.stars[si];
      const vx = (st.x + lstTurns) % 1;
      const sx = ((vx - f.view.x0) / span) * w;
      if (sx < 0 || sx >= w) continue;
      const sy = hy * (1 - st.y * 0.98);
      const yi = sy | 0;
      if (yi < 0 || yi >= yLim) continue;
      const nearHorizon = Math.min(1, (hy - sy) / (h * 0.12));
      const tw = f.motion > 0 ? 0.75 + 0.25 * Math.sin(f.t * (0.8 + st.mag * 1.7) + st.tw) : 0.9;
      const a = starVis * nearHorizon * tw * (0.25 + 0.75 * st.mag);
      if (a < 0.02) continue;
      const i = yi * w + (sx | 0);
      addLight(px, i, 235, 240, 255, a);
      if (st.mag > 0.75 && (sx | 0) + 1 < w) addLight(px, i + 1, 235, 240, 255, a * 0.35);
    }
  }

  // 3. Sun glow, horizon band glow, and disc — one pass over a bounded rectangle.
  const sp = project(f.sun.altitude, f.sun.azimuth, f, w, h, L);
  const sunR = h * 0.022 * (o.sunScale ?? 1);
  const sc = sunColour(f.sun.altitude);
  const low = Math.max(0, 1 - Math.abs(f.sun.altitude - 1) / 12); // horizon band strength
  const glowK = f.sun.altitude > -8 ? Math.min(1, (f.sun.altitude + 8) / 8) : 0;
  const R = h * (0.3 + 0.25 * low);
  const sunVisible = sp.y - sunR < hy && glowK > 0;
  if (glowK > 0) {
    const x0 = Math.max(0, (sp.x - R * 1.8) | 0), x1 = Math.min(w, (sp.x + R * 1.8) | 0);
    const y0 = Math.max(0, (Math.min(sp.y, hy) - R) | 0), y1 = Math.min(yLim, (Math.max(sp.y, hy) + R * 0.4) | 0);
    const invR2 = 1 / (R * R);
    const bandW = 1 / (R * 1.8 * R * 1.8), bandH = 1 / (h * 0.09 * h * 0.09);
    const disc2 = sunR * sunR;
    const core2 = (sunR * 2.4) ** 2;
    const strength = 0.55 * glowK;
    const disc = mixc(sc, rgb(255, 250, 240), 0.82);
    const u8 = new Uint8ClampedArray(px.buffer, px.byteOffset, px.length * 4);
    const lr = sc.r, lg = sc.g * 0.92, lb = sc.b * 0.85, kLow = 1 - 0.35 * (1 - low);
    for (let y = y0; y < y1; y++) {
      const dy = y - sp.y, dy2 = dy * dy;
      const by = y - hy, by2 = by * by;
      const above = y <= hy;
      // Only the columns either term can reach on this row.
      const rr = R * R - dy2;
      let half = rr > 0 ? Math.sqrt(rr) : 0;
      if (low > 0) {
        const bb = 1 - by2 * bandH;
        if (bb > 0) half = Math.max(half, R * 1.8 * Math.sqrt(bb));
      }
      if (above && dy2 < core2) half = Math.max(half, Math.sqrt(core2 - dy2));
      const xa = Math.max(x0, (sp.x - half) | 0), xb = Math.min(x1, (sp.x + half + 1) | 0);
      let o2 = y * w + xa;
      for (let x = xa; x < xb; x++, o2++) {
        const dx = x - sp.x;
        const d2 = dx * dx + dy2;
        let k = 1 - d2 * invR2;
        k = k > 0 ? k * k * strength : 0;
        if (low > 0) {
          let bk = 1 - dx * dx * bandW - by2 * bandH;
          if (bk > 0) k += bk * bk * low * 0.5 * glowK;
        }
        if (above && d2 < core2) k += (disc2 / (d2 + disc2)) * 0.9 * glowK;
        if (k <= 0.004) continue;
        if (above && d2 < disc2) {
          // The disc is never darker than its own glow: per-channel max with what is there.
          const q0 = o2 << 2;
          if (u8[q0] < disc.r) u8[q0] = disc.r;
          if (u8[q0 + 1] < disc.g) u8[q0 + 1] = disc.g;
          if (u8[q0 + 2] < disc.b) u8[q0 + 2] = disc.b;
          continue;
        }
        const kk = (k < 0.95 ? k : 0.95) * kLow + BAYER[(y & 3) * 4 + (x & 3)] / 255;
        const q = o2 << 2;
        u8[q] += lr * kk;
        u8[q + 1] += lg * kk;
        u8[q + 2] += lb * kk;
      }
    }
  }

  // 4. Moon with its real phase.
  const mp = o.moonAt ?? project(f.moon.altitude, f.moon.azimuth, f, w, h, L);
  const moonR = h * 0.02 * (o.moonScale ?? 1);
  const moonVisible = (o.moonAt != null || f.moon.altitude > -0.5) && mp.y - moonR < hy;
  if (moonVisible) paintMoon(px, w, h, mp.x, mp.y, moonR, f.moon, f.sun.altitude, Math.min(hy, yLim));

  // 5. Slow high clouds.
  const cover = Math.max(o.cloudCover ?? 0, f.clouds ? 0.5 : 0);
  if (cover > 0) paintClouds(px, w, yLim, f, s, col, cover, hy);

  return { colours: col, sun: { x: sp.x, y: sp.y, r: sunR, visible: sunVisible }, moon: { x: mp.x, y: mp.y, r: moonR, visible: moonVisible }, horizonY: hy };
}

/**
 * The Moon: a disc lit from the Sun's direction. For a sphere lit at phase angle i, a disc point
 * (u along the bright-limb direction, z toward the viewer) is lit when u·sin i + z·cos i > 0.
 */
export function paintMoon(px: Uint32Array, w: number, h: number, cx: number, cy: number, r: number, m: MoonState, sunAlt: number, clipY: number) {
  const cosI = 2 * m.illumination - 1;
  const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));
  const a = (m.brightLimb * Math.PI) / 180;
  const ux = Math.sin(a), uy = -Math.cos(a);
  // Daytime moon is pale and see-through; at night it glows.
  const night = Math.max(0, Math.min(1, (-sunAlt + 2) / 10));
  const alpha = 0.45 + 0.55 * night;
  const halo = r * (1.8 + 1.2 * night);
  const x0 = Math.max(0, (cx - halo) | 0), x1 = Math.min(w, (cx + halo + 1) | 0);
  const y0 = Math.max(0, (cy - halo) | 0), y1 = Math.min(h, Math.min(clipY, cy + halo + 1) | 0);
  const r2 = r * r;
  const halo2 = halo * halo;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      const i = y * w + x;
      if (d2 >= r2) {
        // Soft round halo (zero at its edge), stronger when the Moon is fuller and the sky darker.
        if (d2 >= halo2) continue;
        const hk = (r2 / d2 - r2 / halo2) * 0.2 * night * m.illumination;
        if (hk > 0.004) addLight(px, i, 210, 220, 255, hk);
        continue;
      }
      const u = (dx * ux + dy * uy) / r;
      const z = Math.sqrt(Math.max(0, 1 - d2 / r2));
      const lit = u * sinI + z * cosI;
      // Earthshine on the dark side; a soft terminator.
      const k = lit > 0.06 ? 1 : lit < -0.06 ? 0 : (lit + 0.06) / 0.12;
      const edge = Math.min(1, (r - Math.sqrt(d2)) * 1.5); // anti-aliased rim
      const shade = 0.82 + 0.18 * z;
      const earth = 0.06 * night;
      const L = (k * shade + (1 - k) * earth) * alpha * edge;
      blend(px, i, 242, 238, 226, L);
    }
  }
}

function paintClouds(px: Uint32Array, w: number, h: number, f: LivingFrame, s: SkyState, col: SkyColours, cover: number, hy: number) {
  const alt = f.sun.altitude;
  const day = Math.max(0, Math.min(1, (alt + 4) / 14));
  const warm = Math.max(0, 1 - Math.abs(alt - 1) / 9);
  const sc = sunColour(alt);
  // Lit colour: white by day, sun-coloured near the horizon, slate at night.
  const night = rgb(col.mid.r * 0.7 + 10, col.mid.g * 0.7 + 12, col.mid.b * 0.75 + 18);
  const lit = mixc(mixc(night, rgb(250, 250, 255), day), mixc(sc, rgb(250, 160, 170), 0.3), warm * 0.75);
  const span = f.view.x1 - f.view.x0;
  const u8 = new Uint8ClampedArray(px.buffer, px.byteOffset, px.length * 4);
  const lr = lit.r, lg = lit.g, lb = lit.b;
  for (const c of s.clouds) {
    const vx = (((c.x + f.t * c.sp * f.motion * 0.2) % 1.4) + 1.4) % 1.4 - 0.2;
    const cx = ((vx - f.view.x0) / span) * w;
    const cy = c.y * hy;
    const a = c.a * w / span, b = c.b * h * (1 + cover);
    const x0 = Math.max(0, (cx - a) | 0), x1 = Math.min(w, (cx + a) | 0);
    const y0 = Math.max(0, (cy - b) | 0), y1 = Math.min(h, (cy + b) | 0);
    if (x0 >= x1 || y0 >= y1) continue;
    const ia = 1 / (a * a), ib = 1 / (b * b);
    const k0 = c.k * cover * (0.35 + 0.25 * day);
    for (let y = y0; y < y1; y++) {
      const dy = y - cy, dy2 = dy * dy * ib;
      if (dy2 >= 1) continue;
      const shade = dy > 0 ? 0.88 : 1;
      const half = a * Math.sqrt(1 - dy2);
      const xa = Math.max(x0, (cx - half) | 0), xb = Math.min(x1, (cx + half + 1) | 0);
      let o = y * w + xa;
      for (let x = xa; x < xb; x++, o++) {
        const dx = x - cx;
        let k = 1 - dx * dx * ia - dy2;
        if (k <= 0) continue;
        k *= k * k0;
        // Underside a little darker than the top.
        const q = o << 2;
        u8[q] += (lr * shade - u8[q]) * k;
        u8[q + 1] += (lg * shade - u8[q + 1]) * k;
        u8[q + 2] += (lb * shade - u8[q + 2]) * k;
      }
    }
  }
}

export { mixc as mixColour };
