// The person's accent across Lens's own surfaces (docs/features/themes.md, "Accent rules").
//
// Lens's chrome is monochrome; colour appears only where it is earned (IDENTITY §3.1): on things
// that are *on* or *selected*, on the mark under a running app, on focus rings and on progress.
// Those places read a handful of tokens that this module computes from the accent, the surfaces
// the pack really paints and the "Accent strength" setting, so every pair is readable by
// construction:
//
//   --lens-accent-ui        marks, rings, switch tracks, meter fills   ≥ 3:1 on surface and cards
//   --lens-on-accent-ui     the knob or glyph drawn on one of those    ≥ 4.5:1 on --lens-accent-ui
//   --lens-accent-fill      selected chips, primary buttons (Balanced and Vivid; ink at Subtle)
//   --lens-on-accent-fill   text on those                              ≥ 4.5:1 on --lens-accent-fill
//   --lens-accent-wash      how much accent a selected row is washed with (a percentage); capped
//                           so body and secondary text stay ≥ 4.5:1 and the accent ≥ 3:1 on it
//   --lens-accent-edge      how much accent a selected card's hairline takes (a percentage)
//   --lens-accent-hover     how much accent a hover takes (Vivid only)
//   --lens-focus-ring       the keyboard focus ring
//
// tokens.css holds the defaults, which are exactly the monochrome look. When the accent has no
// colour to show (white, black, a grey) or High contrast is on, nothing is written and those
// defaults stay: a grey accent adds no colour, so the chrome is unchanged. No selector depends on
// any of this (values only), so a theme switch pays nothing extra for it in style matching.
import { hslToRgb, rgbToHsl } from "../playground/util";
import { contrastRatio, lighten } from "./packs";

export type AccentStrength = "subtle" | "balanced" | "vivid";

export const ACCENT_STRENGTHS: readonly { id: AccentStrength; label: string; description: string }[] = [
  { id: "subtle", label: "Subtle", description: "Switches, running marks, focus rings and progress." },
  { id: "balanced", label: "Balanced", description: "Also selected items and main buttons." },
  { id: "vivid", label: "Vivid", description: "Stronger tints, and a hint of the accent on hover." },
];
export const DEFAULT_ACCENT_STRENGTH: AccentStrength = "balanced";

export function normalizeAccentStrength(raw?: string | null): AccentStrength {
  return raw === "subtle" || raw === "vivid" ? raw : DEFAULT_ACCENT_STRENGTH;
}

/** Minimums (WCAG 2.x): accent used as UI, and text drawn on an accent fill. */
export const ACCENT_UI_MIN = 3;
export const ON_ACCENT_MIN = 4.5;
/** Below this spread between the colour channels (0–1) an accent is a grey: nothing to show. */
export const ACCENT_CHROMA_MIN = 0.08;

const WASH: Record<AccentStrength, number> = { subtle: 0, balanced: 0.12, vivid: 0.2 };
const EDGE: Record<AccentStrength, number> = { subtle: 0, balanced: 0.45, vivid: 0.8 };
const HOVER: Record<AccentStrength, number> = { subtle: 0, balanced: 0, vivid: 0.08 };

/** tokens.css fallbacks when a pack has no base of its own (Obsidian). */
export const STOCK_BASE = "#08080B";
export const STOCK_CARD = "#111116";

const clean = (h: string) => {
  const s = h.trim().replace("#", "");
  const six = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.padEnd(6, "0").slice(0, 6);
  return /^[0-9a-fA-F]{6}$/.test(six) ? six : "000000";
};
const rgb = (h: string) => {
  const s = clean(h);
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
};
const hex = (c: { r: number; g: number; b: number }) =>
  "#" + [c.r, c.g, c.b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** `color-mix(in srgb, a, b pct)`: b at `t` (0–1) over a. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Spread between the strongest and weakest channel, 0–1. */
export function chroma(h: string): number {
  const c = rgb(h);
  return (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
}

/** The surface and raised card a window paints for a base colour, scheme, accent and glass tint. */
export function paintedSurfaces(base: string | undefined | null, scheme: "light" | "dark", accent: string, tint: number): { surface: string; card: string } {
  const b = base ? "#" + clean(base).toUpperCase() : STOCK_BASE;
  const surface = tint > 0 ? mixHex(b, accent, Math.min(1, tint)) : b;
  const card = base ? (scheme === "light" ? "#FFFFFF" : lighten(b, 0.045).toUpperCase()) : STOCK_CARD;
  return { surface, card };
}

/** Moves the accent's lightness (hue kept) until it reaches `min` on every surface. */
export function fitAccent(accent: string, surfaces: readonly string[], scheme: "light" | "dark", min = ACCENT_UI_MIN): string {
  const start = "#" + clean(accent).toUpperCase();
  if (surfaces.every((s) => contrastRatio(start, s) >= min)) return start;
  const [h, s, l0] = rgbToHsl(rgb(start));
  for (let i = 1; i <= 50; i++) {
    const l = scheme === "dark" ? l0 + ((1 - l0) * i) / 50 : l0 * (1 - i / 50);
    const out = hex(hslToRgb(h, s, l));
    if (surfaces.every((x) => contrastRatio(out, x) >= min)) return out;
  }
  return scheme === "dark" ? "#FFFFFF" : "#000000";
}

/** Ink for text on an accent fill: Lens's near-black or near-white when it reaches 4.5:1, else pure. */
export function inkOn(fill: string): string {
  const dark = "#09090B";
  const light = "#FAFAFA";
  const best = contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
  if (contrastRatio(fill, best) >= ON_ACCENT_MIN) return best;
  return contrastRatio(fill, "#000000") >= contrastRatio(fill, "#FFFFFF") ? "#000000" : "#FFFFFF";
}

export interface AccentInput {
  accent: string;
  surface: string;
  card: string;
  scheme: "light" | "dark";
  strength: AccentStrength;
  /** Body and secondary text of the pack's scheme (tokens.css), for the wash cap. */
  fg: string;
  secondary: string;
  /** Lens's High contrast setting: the accent steps aside for the plain high-contrast chrome. */
  highContrast?: boolean;
}

export interface AccentTokens {
  ui: string;
  onUi: string;
  /** null at Subtle: selected chips and primary buttons keep the ink fill. */
  fill: string | null;
  onFill: string | null;
  /** 0–1 */
  wash: number;
  edge: number;
  hover: number;
}

/** The accent tokens for a window, or null when the monochrome defaults should stay. */
export function accentTokens(i: AccentInput): AccentTokens | null {
  if (i.highContrast || chroma(i.accent) < ACCENT_CHROMA_MIN) return null;
  const ui = fitAccent(i.accent, [i.surface, i.card], i.scheme);
  const on = inkOn(ui);
  const readable = (w: number) =>
    [i.surface, i.card].every((s) => {
      const washed = mixHex(s, ui, w);
      return contrastRatio(i.fg, washed) >= ON_ACCENT_MIN && contrastRatio(i.secondary, washed) >= ON_ACCENT_MIN && contrastRatio(ui, washed) >= ACCENT_UI_MIN;
    });
  let wash = WASH[i.strength];
  while (wash > 0 && !readable(wash)) wash = Math.max(0, Math.round((wash - 0.02) * 100) / 100);
  const filled = i.strength !== "subtle";
  return { ui, onUi: on, fill: filled ? ui : null, onFill: filled ? on : null, wash, edge: EDGE[i.strength], hover: Math.min(HOVER[i.strength], wash) };
}

/** The custom properties for a set of tokens (what applyAccentTokens writes). */
export function accentCssVariables(t: AccentTokens): Record<string, string> {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const out: Record<string, string> = {
    "--lens-accent-ui": t.ui,
    "--lens-on-accent-ui": t.onUi,
    "--lens-accent-wash": pct(t.wash),
    "--lens-accent-edge": pct(t.edge),
    "--lens-accent-hover": pct(t.hover),
    "--lens-focus-ring": t.ui,
  };
  if (t.fill && t.onFill) {
    out["--lens-accent-fill"] = t.fill;
    out["--lens-on-accent-fill"] = t.onFill;
  }
  return out;
}

export const ACCENT_VARIABLES = [
  "--lens-accent-ui",
  "--lens-on-accent-ui",
  "--lens-accent-fill",
  "--lens-on-accent-fill",
  "--lens-accent-wash",
  "--lens-accent-edge",
  "--lens-accent-hover",
  "--lens-focus-ring",
] as const;

type Root = { style: { setProperty(k: string, v: string): void; removeProperty(k: string): void; getPropertyValue(k: string): string } };

function write(root: Root, t: AccentTokens | null) {
  const vars = t ? accentCssVariables(t) : {};
  for (const k of ACCENT_VARIABLES) {
    const v = vars[k];
    // Untouched when unchanged: an inherited custom property that is rewritten restyles the window.
    if (v === undefined) {
      if (root.style.getPropertyValue(k)) root.style.removeProperty(k);
    } else if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v);
  }
}

/** What the theme last asked for, so a living look can re-derive the tokens for its own colours. */
let fromTheme: AccentInput | null = null;

/** Writes the accent tokens for the theme on the document root (applyThemeToDocument). */
export function applyAccentTokens(root: Root, input: AccentInput): AccentTokens | null {
  fromTheme = input;
  const t = accentTokens(input);
  write(root, t);
  return t;
}

/** A living look changed the accent and surfaces of this window: same strength, new colours. */
export function retintAccent(root: Root, look: { accent: string; surface: string; card: string; scheme: "light" | "dark" }): void {
  if (!fromTheme) return;
  const sameScheme = look.scheme === fromTheme.scheme;
  write(
    root,
    accentTokens({
      ...fromTheme,
      ...look,
      fg: sameScheme ? fromTheme.fg : look.scheme === "light" ? "#18181B" : "#FAFAFA",
      secondary: sameScheme ? fromTheme.secondary : look.scheme === "light" ? "#52525B" : "#A1A1AA",
    })
  );
}

/** The living look let go: back to the theme's own tokens. */
export function restoreAccent(root: Root): void {
  if (fromTheme) write(root, accentTokens(fromTheme));
}
