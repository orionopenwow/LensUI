// Lens Browser's own look ("Make it yours": its own accent and light/dark scheme) and the accent
// tokens computed for it (src/themes/accentTokens.ts, scopedAccentVariables). Pure; tested in
// src/__tests__/accentApps.test.ts.
import { themeAccentInput, type ScopedLook } from "../themes/accentTokens";
import type { Appearance } from "./api";

/** Light/dark tokens for when the browser's own scheme differs from Lens's. */
export const SCHEME_TOKENS: Record<"light" | "dark", Record<string, string>> = {
  dark: {
    "--lens-pack-base": "#0a0a0b", "--lens-bg-base": "#0a0a0b", "--lens-bg-surface": "#111113", "--lens-bg-elevated": "#18181b", "--lens-bg-hover": "rgba(255,255,255,.06)",
    "--lens-fg": "#ededef", "--lens-fg-strong": "#fafafa", "--lens-fg-secondary": "#b4b4b9", "--lens-fg-muted": "#86868c", "--lens-border": "rgba(255,255,255,.08)",
    "--lens-border-strong": "rgba(255,255,255,.14)", "--lens-on-fg": "#0a0a0b",
  },
  light: {
    "--lens-pack-base": "#f5f5f3", "--lens-bg-base": "#f5f5f3", "--lens-bg-surface": "#fbfbfa", "--lens-bg-elevated": "#ffffff", "--lens-bg-hover": "rgba(0,0,0,.05)",
    "--lens-fg": "#1c1c1e", "--lens-fg-strong": "#0a0a0b", "--lens-fg-secondary": "#4a4a50", "--lens-fg-muted": "#6e6e75", "--lens-border": "rgba(0,0,0,.08)",
    "--lens-border-strong": "rgba(0,0,0,.14)", "--lens-on-fg": "#ffffff",
  },
};

/**
 * The look the accent tokens are computed for when Lens Browser paints its own accent or scheme
 * ("Make it yours"), so switches, selected items and focus rings stay readable on the browser's own
 * surfaces; null when it follows Lens (the window's tokens already fit). Exported for the tests.
 */
export function browserAccentLook(appearance: Pick<Appearance, "accent" | "scheme">, theme = themeAccentInput()): ScopedLook | null {
  const own = appearance.scheme === "auto" ? null : appearance.scheme;
  if (!appearance.accent && !own) return null;
  const scheme = own ?? theme?.scheme ?? "dark";
  const t = own ? SCHEME_TOKENS[own] : null;
  return {
    accent: appearance.accent ?? theme?.accent ?? "#FAFAFA",
    surface: t ? t["--lens-pack-base"] : theme?.surface ?? "#08080B",
    card: t ? t["--lens-bg-elevated"] : theme?.card ?? "#111116",
    scheme,
    fg: t ? t["--lens-fg"] : theme?.fg,
    secondary: t ? t["--lens-fg-secondary"] : theme?.secondary,
  };
}
