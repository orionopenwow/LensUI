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
/** What the window wears now: the theme's input, or the living look's re-derivation of it. */
let live: AccentInput | null = null;
/** An accent that overrides the window's own for a while ("Theme follows music"), or null. */
let followed: string | null = null;

/** Body and secondary text of a scheme (tokens.css), for a look that switched scheme. */
export const SCHEME_TEXT: Record<"light" | "dark", { fg: string; secondary: string }> = {
  dark: { fg: "#FAFAFA", secondary: "#A1A1AA" },
  light: { fg: "#18181B", secondary: "#52525B" },
};

// Subtrees that compute their own tokens (scopedAccentVariables) re-render when the theme's input
// changes: a tiny version counter they subscribe to (useScopedAccent).
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};
export function onAccentChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const accentVersion = () => version;

const sameInput = (a: AccentInput | null, b: AccentInput) =>
  !!a && a.accent === b.accent && a.surface === b.surface && a.card === b.card && a.scheme === b.scheme && a.strength === b.strength && a.fg === b.fg && a.secondary === b.secondary && !!a.highContrast === !!b.highContrast;

function wear(root: Root, input: AccentInput) {
  live = input;
  write(root, accentTokens(followed ? { ...input, accent: followed } : input));
}

/** Writes the accent tokens for the theme on the document root (applyThemeToDocument). */
export function applyAccentTokens(root: Root, input: AccentInput): AccentTokens | null {
  const changed = !sameInput(fromTheme, input);
  fromTheme = input;
  // applyThemeToDocument rewrites --lens-accent with the theme's own, so a followed accent ends too.
  followed = null;
  live = input;
  const t = accentTokens(input);
  write(root, t);
  if (changed) bump();
  return t;
}

/** A living look changed the accent and surfaces of this window: same strength, new colours. */
export function retintAccent(root: Root, look: { accent: string; surface: string; card: string; scheme: "light" | "dark" }): void {
  if (!fromTheme) return;
  const sameScheme = look.scheme === fromTheme.scheme;
  wear(root, {
    ...fromTheme,
    ...look,
    fg: sameScheme ? fromTheme.fg : SCHEME_TEXT[look.scheme].fg,
    secondary: sameScheme ? fromTheme.secondary : SCHEME_TEXT[look.scheme].secondary,
  });
}

/** The living look let go: back to the theme's own tokens. */
export function restoreAccent(root: Root): void {
  if (fromTheme) wear(root, fromTheme);
}

/**
 * Another accent for this window's controls for a while, on the surfaces it already wears, at the
 * same strength (Lens Music's "Theme follows music" fades --lens-accent towards the artwork and
 * calls this on every step), or null to go back. The artwork's colour goes through the same
 * contrast fitting as any accent, so a dark cover on a dark theme still gives readable controls.
 */
export function followAccent(root: Root, accent: string | null): void {
  followed = accent;
  const base = live ?? fromTheme;
  if (base) write(root, accentTokens(followed ? { ...base, accent: followed } : base));
}

/** The look a subtree paints for itself: its accent, its surfaces and its scheme. */
export interface ScopedLook {
  accent: string;
  surface: string;
  card: string;
  scheme: "light" | "dark";
  fg?: string;
  secondary?: string;
}

/** Monochrome ink for a subtree, used where its accent shows no colour (grey, High contrast). */
export interface PlainInk {
  ui: string;
  onUi: string;
}

const DEFAULT_INPUT: AccentInput = {
  accent: "#FAFAFA",
  surface: STOCK_BASE,
  card: STOCK_CARD,
  scheme: "dark",
  strength: DEFAULT_ACCENT_STRENGTH,
  fg: SCHEME_TEXT.dark.fg,
  secondary: SCHEME_TEXT.dark.secondary,
};

/**
 * Every accent variable for a subtree that paints its own accent or scheme (Lens Browser's own
 * look, Lens Music's artwork tint), at the theme's strength and High contrast: written on the
 * subtree's root, so nothing leaks in from the window's tokens (computed for other colours).
 * `plain` is the monochrome ink there (the subtree's own --lens-fg / --lens-on-fg by default).
 */
export function scopedAccentVariables(look: ScopedLook, plain: PlainInk = { ui: "var(--lens-fg)", onUi: "var(--lens-on-fg)" }): Record<string, string> {
  const base = fromTheme ?? DEFAULT_INPUT;
  const text = SCHEME_TEXT[look.scheme];
  const t = accentTokens({
    strength: base.strength,
    highContrast: base.highContrast,
    accent: look.accent,
    surface: look.surface,
    card: look.card,
    scheme: look.scheme,
    fg: look.fg ?? text.fg,
    secondary: look.secondary ?? text.secondary,
  });
  const out: Record<string, string> = {
    "--lens-accent-ui": plain.ui,
    "--lens-on-accent-ui": plain.onUi,
    "--lens-accent-fill": plain.ui,
    "--lens-on-accent-fill": plain.onUi,
    "--lens-accent-wash": "0%",
    "--lens-accent-edge": "0%",
    "--lens-accent-hover": "0%",
    "--lens-focus-ring": plain.ui,
    ...(t ? accentCssVariables(t) : {}),
  };
  return out;
}

/** The accent the window wears without a followed one (the theme's, or the living look's). */
export const wornAccent = (): string | null => (live ?? fromTheme)?.accent ?? null;

/** The theme's own accent input in this window (null before the theme was applied). */
export const themeAccentInput = (): AccentInput | null => fromTheme;
