// Contrast audit for every theme pack (docs/features/themes.md quick win, docs/THEMES_AUDIT.md).
// Computes what the window really paints for a pack: the surface (pack base, with the pack's accent
// tint mixed in, as tokens.css `--lens-surface-solid` does), the raised card (`--lens-pack-elevated`,
// set in useLensState.applyThemeToDocument) and the text tokens of the pack's scheme (tokens.css),
// then checks them against WCAG 2.x:
//   body text  (--lens-fg, --lens-fg-secondary)       ≥ 4.5:1 on the surface and on cards
//   icons and large text (--lens-fg-muted, accent)   ≥ 3:1   on the surface and on cards
// Packs that follow the Windows accent are checked for text only (their accent is the person's).
import { allPacks, contrastRatio, lighten, type ThemePack } from "./packs";

export const BODY_MIN = 4.5;
export const ICON_MIN = 3;

/** Text tokens per scheme, as tokens.css sets them. `src/__tests__/themeContrast.test.ts` keeps them in sync. */
export const TEXT_TOKENS = {
  dark: { fg: "#FAFAFA", secondary: "#A1A1AA", muted: "#71717A" },
  light: { fg: "#18181B", secondary: "#52525B", muted: "#63636B" },
  /** Dark packs with lighter bases get brighter secondary and muted tones (tokens.css, same list). */
  lifted: { fg: "#FAFAFA", secondary: "#C4C4CC", muted: "#A8A8B0" },
} as const;

/** Dark packs whose secondary and muted text are always lifted (chosen by hand before the audit). */
export const LIFTED_TEXT_PACKS = ["nord-frost", "everforest-dark", "dracula-glass", "gruvbox-warm", "solarized-matte"] as const;

/** tokens.css fallbacks when a pack has no base of its own (Obsidian). */
const STOCK_BASE = "#08080B";
const STOCK_CARD = "#111116";

const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.replace("#", "").padEnd(6, "0").slice(i - 1, i + 1), 16));

/** `color-mix(in srgb, a, b pct)`: b at `t` (0–1) over a. */
export function mixSrgb(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return ("#" + x.map((v, i) => hex(v + (y[i] - v) * t)).join("")).toUpperCase();
}

export type ContrastCheck = "text" | "secondary text" | "muted text" | "accent";
export interface PackContrast {
  id: string;
  label: string;
  scheme: "light" | "dark";
  surface: string;
  card: string;
  accentChecked: boolean;
  /** Lowest ratio of each check over surface and card. */
  ratios: Record<ContrastCheck, number>;
  failures: string[];
}

/**
 * Whether a dark pack gets the lifted text tones (`data-text-lift` on <html>, tokens.css): the
 * hand-picked list, plus any dark pack whose base is light enough that the stock secondary or
 * muted tone would miss its minimum. Light packs never do.
 */
export function liftsText(p: ThemePack | undefined): boolean {
  if (!p || p.scheme === "light") return false;
  if ((LIFTED_TEXT_PACKS as readonly string[]).includes(p.id)) return true;
  const { surface, card } = surfaces(p);
  const worst = (c: string) => Math.min(contrastRatio(c, surface), contrastRatio(c, card));
  return worst(TEXT_TOKENS.dark.secondary) < BODY_MIN || worst(TEXT_TOKENS.dark.muted) < ICON_MIN;
}

export function textTokensFor(p: ThemePack) {
  if (p.scheme === "light") return TEXT_TOKENS.light;
  return liftsText(p) ? TEXT_TOKENS.lifted : TEXT_TOKENS.dark;
}

/** The surface and raised-card colours a pack paints (no glass: the solid colours under it). */
export function surfaces(p: ThemePack): { surface: string; card: string } {
  const base = p.base ?? STOCK_BASE;
  const surface = p.tint > 0 ? mixSrgb(base, p.accent, p.tint) : base.toUpperCase();
  const card = (p.base ? (p.scheme === "light" ? "#FFFFFF" : lighten(p.base, 0.045)) : STOCK_CARD).toUpperCase();
  return { surface, card };
}

export function packContrast(p: ThemePack): PackContrast {
  const scheme = p.scheme === "light" ? "light" : "dark";
  const { surface, card } = surfaces(p);
  const t = textTokensFor(p);
  const worst = (c: string) => Math.min(contrastRatio(c, surface), contrastRatio(c, card));
  const accentChecked = p.accentMode !== "windows";
  const ratios: Record<ContrastCheck, number> = {
    text: worst(t.fg),
    "secondary text": worst(t.secondary),
    "muted text": worst(t.muted),
    accent: accentChecked ? worst(p.accent) : Infinity,
  };
  const failures: string[] = [];
  const need: Record<ContrastCheck, number> = { text: BODY_MIN, "secondary text": BODY_MIN, "muted text": ICON_MIN, accent: ICON_MIN };
  for (const k of Object.keys(need) as ContrastCheck[]) {
    if (ratios[k] < need[k]) failures.push(`${k} ${ratios[k].toFixed(2)}:1 < ${need[k]}:1`);
  }
  return { id: p.id, label: p.label, scheme, surface, card, accentChecked, ratios, failures };
}

/** Every listed pack (custom packs are the person's own and are checked when they are saved). */
export function auditAllPacks(): PackContrast[] {
  return allPacks()
    .filter((p) => p.tier !== "Custom")
    .map(packContrast);
}
