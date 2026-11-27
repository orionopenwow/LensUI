// Artwork-tinted accents for Now Playing and Immersive (pure; tested in src/__tests__/musicUpgrade.test.ts).
//
// The page's accent (active buttons, the seek fill, the current lyric glow) comes from the artwork's
// palette when one of its colours can be made to read: at least 4.5:1 against every background the
// accent sits on, without being washed out to plain white or black. Otherwise the theme accent is
// used (also lifted to 4.5:1). Text on an accent fill gets whichever of near-black or near-white
// reads best, and it is checked too.
import { contrast, ensureContrast, hexToRgb, mix, rgbToHex, type RGB } from "./model";

export interface Tint {
  /** The accent (hex). */
  accent: string;
  /** Text colour on an accent fill (hex). */
  onAccent: string;
  /** True when the accent came from the artwork. */
  fromArt: boolean;
  /** Its worst contrast against the backgrounds it was checked on. */
  ratio: number;
}

export const MIN_TEXT = 4.5;
const INK_DARK: RGB = { r: 9, g: 9, b: 11 };
const INK_LIGHT: RGB = { r: 250, g: 250, b: 250 };

function hsl(c: RGB): { s: number; l: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  return { s: l > 0.5 ? d / (2 - max - min) : d / (max + min), l };
}

/** Lowest contrast of `fg` over a set of backgrounds. */
export function worstContrast(fg: RGB, backgrounds: RGB[]): number {
  return backgrounds.reduce((m, bg) => Math.min(m, contrast(fg, bg)), Infinity);
}

/** Lifts `fg` until it reaches `min` against every background (all dark or all light). */
export function liftAgainst(fg: RGB, backgrounds: RGB[], min = MIN_TEXT): RGB {
  let c = fg;
  for (let i = 0; i < 4; i++) {
    for (const bg of backgrounds) c = ensureContrast(c, bg, min);
    if (worstContrast(c, backgrounds) >= min) break;
  }
  return c;
}

/** Near-black or near-white text for an accent fill, whichever reads best. */
export function textOn(fill: RGB): RGB {
  return contrast(INK_DARK, fill) >= contrast(INK_LIGHT, fill) ? INK_DARK : INK_LIGHT;
}

/**
 * The accent for a page whose backgrounds are `backgrounds` (hex), from the artwork's palette
 * (most populous first) with the theme accent as the fallback.
 */
export function pickTint(palette: { color: RGB; weight: number }[], backgrounds: string[], themeAccent: string): Tint {
  const bgs = backgrounds.map((b) => hexToRgb(b)).filter((b): b is RGB => !!b);
  const surfaces = bgs.length ? bgs : [INK_DARK];
  // Vivid, reasonably common colours first; greys can't carry a tint.
  const ranked = palette
    .map((p) => ({ ...p, ...hsl(p.color) }))
    .filter((p) => p.s >= 0.22 && p.weight >= 0.04)
    .sort((a, b) => b.s * 0.7 + b.weight * 0.6 - (a.s * 0.7 + a.weight * 0.6));
  for (const p of ranked) {
    const lifted = liftAgainst(p.color, surfaces);
    const ratio = worstContrast(lifted, surfaces);
    // Lifting must leave some colour: if it had to go nearly all the way to white/black, skip it.
    if (ratio >= MIN_TEXT && hsl(lifted).s >= 0.18 && hsl(lifted).l > 0.06 && hsl(lifted).l < 0.94) {
      return { accent: rgbToHex(lifted), onAccent: rgbToHex(textOn(lifted)), fromArt: true, ratio };
    }
  }
  const own = hexToRgb(themeAccent) ?? INK_LIGHT;
  const lifted = liftAgainst(own, surfaces);
  return { accent: rgbToHex(lifted), onAccent: rgbToHex(textOn(lifted)), fromArt: false, ratio: worstContrast(lifted, surfaces) };
}

/** The backgrounds Now Playing's accent sits on: the hero gradient's top, middle and base. */
export function heroBackgrounds(palette: { color: RGB; weight: number }[], base: string, vivid: RGB | null): string[] {
  const b = hexToRgb(base) ?? INK_DARK;
  const a = palette[0]?.color ?? b;
  const v = vivid ?? a;
  return [rgbToHex(mix(b, v, 0.62)), rgbToHex(mix(b, a, 0.38)), rgbToHex(b)];
}
