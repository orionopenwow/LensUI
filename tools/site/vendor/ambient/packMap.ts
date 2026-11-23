import type { AmbientParams } from "./core";
import { THEME_PACKS } from "../../themes/packs";

/**
 * Which ambient backdrop each theme pack gets, and how it is tuned. Keyed by pack id so packs
 * from other branches (community `cc-*` packs, Expressive / Dot Matrix) work as soon as they
 * land; anything not listed falls back by mood (dark → rolling waves, light → paper fibres).
 * Table with reasons: docs/AMBIENT.md.
 */
export interface AmbientChoice {
  scene: string;
  params?: AmbientParams;
}

export const PACK_AMBIENT: Record<string, AmbientChoice> = {
  // ---- Built-in packs ----
  obsidian: { scene: "waves" },
  "windows-mesh": { scene: "breathe", params: { saturation: 0.8 } },
  graphite: { scene: "grain-fog", params: { saturation: 0 } },
  midnight: { scene: "star-drift" },
  "catppuccin-mocha": { scene: "breathe", params: { hueShift: 60 } },
  "tokyo-night": { scene: "contours" },
  "nord-frost": { scene: "drift-aurora", params: { saturation: 0.8, hueShift: 30 } },
  "dracula-glass": { scene: "halftone-tide", params: { density: 1.2 } },
  "gruvbox-warm": { scene: "grain-fog" },
  "kanagawa-wave": { scene: "waves", params: { speed: 0.8 } },
  "rose-pine": { scene: "breathe", params: { hueShift: -40, saturation: 0.7 } },
  "everforest-dark": { scene: "contours", params: { density: 0.7, saturation: 0.7 } },
  "hyprland-neon": { scene: "glow-contours" },
  "sequoia-frost": { scene: "breathe", params: { saturation: 0.35, speed: 0.8 } },
  "cyberpunk-amber": { scene: "scanlines" },
  "solarized-matte": { scene: "plotter" },
  "alabaster-daylight": { scene: "paper" },
  "paper-minimal": { scene: "paper", params: { amount: 1.1 } },

  // ---- Expressive / Dot Matrix (PR #32) ----
  "lens-expressive": { scene: "breathe", params: { saturation: 0.6 } },
  "lens-expressive-light": { scene: "paper" },
  "lens-dot-matrix": { scene: "halftone-tide", params: { density: 0.8 } },

  // ---- Claude Code community packs (PR #31): Lens-original scenes matched to each mood ----
  "cc-honu-lagoon": { scene: "caustics" },
  "cc-koi-mosaic": { scene: "breathe" },
  "cc-halftone-dawn": { scene: "halftone-tide" },
  "cc-halftone-dusk": { scene: "halftone-tide" },
  "cc-plotter-tide": { scene: "plotter" },
  "cc-plotter-tide-night": { scene: "plotter" },
  "cc-dither-dunes": { scene: "dither-dunes" },
  "cc-dither-dunes-night": { scene: "dither-dunes" },
  "cc-paper-garden": { scene: "paper" },
  "cc-paper-garden-kraft": { scene: "paper" },
  "cc-night-reef": { scene: "caustics", params: { speed: 0.8 } },
  "cc-snow-pines": { scene: "star-drift" },
  "cc-braille-stars": { scene: "star-drift" },
  "cc-block-clouds": { scene: "pixel-clouds" },
  "cc-vector-range": { scene: "glow-contours" },
  "cc-departure-board": { scene: "scanlines" },
  "cc-blueprint": { scene: "contours" },
  "cc-deep-water": { scene: "caustics" },
  "cc-aurora": { scene: "drift-aurora" },
  "cc-ember": { scene: "grain-fog" },
  "cc-claude-dark": { scene: "waves" },
  "cc-claude-light": { scene: "paper" },
  "cc-claude-dusk": { scene: "breathe" },
  "cc-claude-midnight": { scene: "star-drift" },
  "cc-claude-dark-brand": { scene: "grain-fog" },
  "cc-claude-light-brand": { scene: "paper" },
  "cc-retro-amber": { scene: "scanlines" },
  "cc-retro-green": { scene: "scanlines" },
  "cc-retro-white": { scene: "scanlines" },
  "cc-retro-cga": { scene: "pixel-clouds" },
  "cc-retro-crt": { scene: "scanlines" },
  "cc-retro-synthwave": { scene: "drift-aurora", params: { hueShift: -60 } },
  "cc-catppuccin-latte": { scene: "paper" },
  "cc-catppuccin-frappe": { scene: "breathe", params: { hueShift: 60 } },
  "cc-catppuccin-macchiato": { scene: "breathe", params: { hueShift: 60 } },
  "cc-gruvbox-light": { scene: "paper" },
  "cc-rose-pine-moon": { scene: "breathe", params: { hueShift: -40, saturation: 0.7 } },
  "cc-rose-pine-dawn": { scene: "paper" },
  "cc-solarized-light": { scene: "plotter" },
  "cc-everforest-light": { scene: "paper" },
  "cc-github-dark": { scene: "waves" },
  "cc-github-dark-dimmed": { scene: "waves", params: { speed: 0.8 } },
  "cc-github-light": { scene: "paper" },
  "cc-one-dark": { scene: "contours" },
  "cc-onehalf-light": { scene: "paper" },
  "cc-monokai": { scene: "glow-contours" },
  "cc-monokai-pro": { scene: "contours" },
  "cc-base16-ocean": { scene: "waves" },
  "cc-base16-eighties": { scene: "plotter" },
  "cc-base16-cupcake": { scene: "paper" },
  "cc-wl-cyberpunk": { scene: "scanlines" },
  "cc-wl-daltonized-dark": { scene: "waves", params: { amount: 0.7 } },
  "cc-wl-daltonized-light": { scene: "paper", params: { amount: 0.7 } },
  // High-contrast packs stay almost still and very faint.
  "cc-wl-high-contrast": { scene: "paper", params: { amount: 0.4, speed: 0.5 } },
  "cc-wl-high-contrast-pro": { scene: "waves", params: { amount: 0.4, speed: 0.5 } },
  "cc-wl-nature": { scene: "contours", params: { saturation: 0.7 } },
  "cc-wl-warm-neutral": { scene: "grain-fog" },
  "cc-wl-circit": { scene: "glow-contours" },
  "cc-wl-branded": { scene: "paper" },
};

/** The backdrop for a pack: its own mapping, else the mood fallback. */
export function ambientFor(packId: string | null | undefined, dark: boolean): AmbientChoice {
  const own = packId ? THEME_PACKS.find((p) => p.id === packId)?.ambient : undefined;
  if (own) return own;
  const hit = packId ? PACK_AMBIENT[packId] : undefined;
  if (hit) return hit;
  return dark ? { scene: "waves" } : { scene: "paper" };
}
