// Dock music pop-out: the pure maths behind the "sound glow" and the level meter. No DOM, no
// Tauri — unit-tested in src/__tests__/soundGlow.test.ts.
//
// The speaker level comes from music/levels.rs (one peak number 0..1 from Windows' endpoint
// meter; no audio is captured). The pop-out asks for it only while it is open, something is
// playing, one of the two effects is on and motion isn't reduced (`levelLoopActive`).
import { contrast, hexToRgb, mix, pickVivid, rgbToHex, type RGB } from "./model";

// ------------------------------------------------------------------------- level smoothing

/** Per-frame (60 Hz) share of the gap closed when the level rises: fast attack. */
export const LEVEL_ATTACK = 0.55;
/** Per-frame (60 Hz) share of the gap closed when the level falls: slow release. */
export const LEVEL_RELEASE = 0.07;
const FRAME_MS = 1000 / 60;

/**
 * Moves the shown level towards the raw peak: quickly up, slowly down, independent of the frame
 * rate (`dtMs` is the time since the last frame). Bad input (NaN, negative, > 1) is clamped.
 */
export function smoothLevel(previous: number, raw: number, dtMs = FRAME_MS): number {
  const prev = Number.isFinite(previous) ? Math.min(1, Math.max(0, previous)) : 0;
  const target = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  const k = target > prev ? LEVEL_ATTACK : LEVEL_RELEASE;
  const frames = Math.min(Math.max(Number.isFinite(dtMs) ? dtMs : FRAME_MS, 0), 250) / FRAME_MS;
  const share = 1 - Math.pow(1 - k, frames);
  return prev + (target - prev) * share;
}

// ------------------------------------------------------------------------- auto gain

/** The quietest "loud" the gain ever assumes, so silence and hiss never fill the glow. */
export const GAIN_FLOOR = 0.12;
/** Per-frame (60 Hz) share the remembered loudest peak falls back by: about 4 s to halve. */
export const GAIN_DECAY = 0.003;

/**
 * Windows' peak meter follows the volume slider, so quiet listening barely moved the glow. The
 * loop remembers the recent loudest peak (rising at once, falling slowly) and shows each peak
 * relative to it: the glow pulses fully at any volume.
 */
export function autoGain(previousMax: number, raw: number, dtMs = FRAME_MS): number {
  const prev = Number.isFinite(previousMax) ? Math.min(1, Math.max(GAIN_FLOOR, previousMax)) : GAIN_FLOOR;
  const r = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  if (r >= prev) return r;
  const frames = Math.min(Math.max(Number.isFinite(dtMs) ? dtMs : FRAME_MS, 0), 250) / FRAME_MS;
  return Math.max(GAIN_FLOOR, prev * Math.pow(1 - GAIN_DECAY, frames));
}

/** A raw peak shown relative to the remembered loudest one (0..1). */
export function gained(raw: number, max: number): number {
  const r = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  const m = Number.isFinite(max) ? Math.max(GAIN_FLOOR, max) : GAIN_FLOOR;
  return Math.min(1, r / m);
}

/**
 * The pop-out's edge halo (a coloured rim around the whole card) for a level: it is the part of
 * the glow that visibly pulses with each beat while the card is hovered.
 */
export function haloFrame(level: number, opts: { playing: boolean; reduced: boolean }): number {
  if (opts.reduced) return opts.playing ? 0.55 : 0.3;
  if (!opts.playing) return 0.25;
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return 0.18 + 0.82 * Math.pow(l, 1.4);
}

// ------------------------------------------------------------------------- visibility gating

export interface LoopGate {
  /** The pop-out is on screen. */
  open: boolean;
  /** Windows reports the session as playing. */
  playing: boolean;
  glow: boolean;
  meter: boolean;
  /** Reduce motion (Lens setting or Windows "Animation effects" off): both stay still. */
  reduced: boolean;
  /** The page is hidden (document.hidden). */
  hidden?: boolean;
}

/** Whether the level loop may run (and ask the backend for the level) at all. */
export function levelLoopActive(g: LoopGate): boolean {
  return g.open && g.playing && (g.glow || g.meter) && !g.reduced && !g.hidden;
}

/** At most this often the loop asks the backend for a fresh level (~30 per second). */
export const LEVEL_ASK_MS = 33;

// ------------------------------------------------------------------------- meter and glow frames

/** Fixed per-bar weights so the five bars move differently from one peak number. */
const BAR_WEIGHTS = [0.62, 0.9, 1, 0.78, 0.55];
/** The still pose used when motion is reduced (and while paused: flat). */
export const STATIC_BARS = [0.35, 0.6, 0.85, 0.55, 0.4];
export const REST_BAR = 0.18;

/** Five bar heights (0..1, used as scaleY) for a level at time `tMs`. */
export function meterBars(level: number, tMs: number, opts: { playing: boolean; reduced: boolean }): number[] {
  if (!opts.playing) return BAR_WEIGHTS.map(() => REST_BAR);
  if (opts.reduced) return STATIC_BARS.slice();
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return BAR_WEIGHTS.map((w, i) => {
    // A slow per-bar wobble keeps neighbouring bars from moving in lockstep.
    const wobble = 0.82 + 0.18 * Math.sin(tMs / (170 + i * 37) + i * 1.7);
    return Math.min(1, Math.max(REST_BAR, REST_BAR + (1 - REST_BAR) * l * w * wobble));
  });
}

/** The glow layer's opacity and vertical scale for a level (transform/opacity only). */
export function glowFrame(level: number, opts: { playing: boolean; reduced: boolean }): { opacity: number; scale: number } {
  if (opts.reduced) return { opacity: opts.playing ? 0.85 : 0.6, scale: 1 };
  if (!opts.playing) return { opacity: 0.6, scale: 0.9 };
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return { opacity: 0.62 + 0.38 * l, scale: 0.84 + 0.16 * l };
}

// ------------------------------------------------------------------------- glow colours

export type GlowPlacement = "behind" | "below";

export interface GlowPlan {
  /** Two colours for the gradients (hex). */
  colors: [string, string];
  /** Strongest alpha of the gradients, at the Dock edge. */
  alpha: number;
  /** "behind": the glow reaches up behind the controls row (text and icons there keep ≥ `min`
   *  contrast at `alpha`). "below": too strong a tint would hurt contrast, so it stays in the
   *  empty strip at the Dock edge, under the controls. */
  placement: GlowPlacement;
  /** True when the colours came from the artwork, false for the theme-accent fallback. */
  fromArt: boolean;
}

/** Strongest glow alpha ever used. */
export const GLOW_MAX_ALPHA = 0.5;
/** Below this, a glow behind the controls is too faint to be worth it: it moves below them. */
export const GLOW_MIN_BEHIND = 0.16;

const dist = (a: RGB, b: RGB) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/**
 * The glow's colours and strength for an artwork palette on the current surface.
 *
 * - Colours: the artwork's most vivid colour and its next distinct colour; with no artwork (or
 *   an unreadable one) the theme accent, and a deeper mix of it.
 * - Strength: the highest alpha (≤ GLOW_MAX_ALPHA) at which every colour in `texts` still has
 *   `min` contrast against the surface tinted by the glow. If that is below GLOW_MIN_BEHIND the
 *   glow is placed below the controls instead, at full strength.
 */
export function glowPlan(
  palette: { color: RGB; weight: number }[],
  accent: string,
  base: string,
  texts: string[],
  min = 4.5,
): GlowPlan {
  const b = hexToRgb(base) ?? { r: 9, g: 9, b: 11 };
  const acc = hexToRgb(accent) ?? { r: 250, g: 250, b: 250 };
  const vivid = palette.length ? pickVivid(palette) : null;
  let c1: RGB;
  let c2: RGB;
  const fromArt = !!vivid;
  if (vivid) {
    c1 = vivid;
    c2 = palette.map((p) => p.color).find((c) => dist(c, vivid) > 48) ?? mix(vivid, b, 0.35);
  } else {
    c1 = acc;
    c2 = mix(acc, b, 0.4);
  }
  const fgs = texts.map((t) => hexToRgb(t)).filter((t): t is RGB => !!t);
  const ok = (a: number) =>
    fgs.every((fg) => [c1, c2].every((c) => {
      const tinted = mix(b, c, a);
      return contrast(fg, { r: Math.round(tinted.r), g: Math.round(tinted.g), b: Math.round(tinted.b) }) >= min;
    }));
  let alpha = 0;
  for (let a = GLOW_MAX_ALPHA; a > 0; a = Math.round((a - 0.01) * 100) / 100) {
    if (ok(a)) {
      alpha = a;
      break;
    }
  }
  const placement: GlowPlacement = alpha >= GLOW_MIN_BEHIND ? "behind" : "below";
  return {
    colors: [rgbToHex(c1), rgbToHex(c2)],
    alpha: placement === "behind" ? alpha : GLOW_MAX_ALPHA,
    placement,
    fromArt,
  };
}

/** CSS colour string → hex ("#rrggbb", "rgb(…)", "rgba(…)"), or null. */
export function cssToHex(c: string): string | null {
  const s = c.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return rgbToHex(hexToRgb(s)!);
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (!m) return null;
  return rgbToHex({ r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) });
}

// ------------------------------------------------------------------------- timeline

/** Elapsed and total labels for the progress row ("1:05" / "3:42"); "–:––" when unknown. */
export function progressLabels(positionMs: number, durationMs: number, format: (ms: number) => string): { elapsed: string; total: string } {
  if (!(durationMs > 0)) return { elapsed: "–:––", total: "–:––" };
  return { elapsed: format(Math.min(Math.max(0, positionMs), durationMs)), total: format(durationMs) };
}

/** Position for a pointer at `x` over a bar starting at `left` with `width`. */
export function seekFromPointer(x: number, left: number, width: number, durationMs: number): number {
  if (!(width > 0) || !(durationMs > 0)) return 0;
  const t = Math.min(1, Math.max(0, (x - left) / width));
  return Math.round(t * durationMs);
}

/** Keyboard seeking on the bar: ←/→ 5 s, PageUp/PageDown 10 %, Home/End. Null for other keys. */
export function seekFromKey(key: string, positionMs: number, durationMs: number): number | null {
  if (!(durationMs > 0)) return null;
  const clamp = (v: number) => Math.round(Math.min(durationMs, Math.max(0, v)));
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(positionMs - 5000);
    case "ArrowRight":
    case "ArrowUp":
      return clamp(positionMs + 5000);
    case "PageDown":
      return clamp(positionMs - durationMs * 0.1);
    case "PageUp":
      return clamp(positionMs + durationMs * 0.1);
    case "Home":
      return 0;
    case "End":
      return clamp(durationMs - 1000);
    default:
      return null;
  }
}

/** Position now, extrapolated from Windows' last report while playing. */
export function livePositionMs(m: { positionMs: number; durationMs: number; updatedMs: number; isPlaying: boolean }, nowMs: number): number {
  let p = Number.isFinite(m.positionMs) ? m.positionMs : 0;
  if (m.isPlaying && m.updatedMs > 0 && nowMs > m.updatedMs) p += nowMs - m.updatedMs;
  if (m.durationMs > 0) p = Math.min(p, m.durationMs);
  return Math.max(0, Math.floor(p));
}
