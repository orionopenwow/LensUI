// The featured looks: twelve themes that are unmistakably different at a glance, each a whole
// look and not just a palette. A look adds, on top of its theme pack (colours, radius, icons,
// folders, window frame and buttons, backdrop): the font, how solid the glass is, the Dock style
// and how it moves, and a matching pointer family.
//
// Every other pack stays available under "More themes", filed under the featured look it most
// resembles (src/themes/distance.ts; the audit is docs/THEMES_AUDIT.md).
//
// Applying a look is one config change (`applyFeaturedLook`), so it goes through the same
// non-blocking apply path as any pack and is undone by re-applying the previous config.
import type { LensConfig } from "../types/lens";
import { allPacks, applyThemePack, packById, type ThemePack } from "./packs";
import { nearest, packDistance, packScene } from "./distance";

export type LookFont = "rounded-arial" | "inter-sans" | "tech-mono" | "editorial-serif";
export type LookFeel = "calm" | "crisp" | "playful";

export interface FeaturedLook {
  /** Theme pack id this look is built on. */
  id: string;
  /** One line that says what makes it itself. */
  character: string;
  font: LookFont;
  /** Surface opacity (0.4–1; 1 = solid, no glass). */
  glass: number;
  /** Backdrop blur in px (0 = none). */
  blur: number;
  dock: {
    style: string;
    magnification: "off" | "subtle" | "classic";
    launch: "none" | "lift" | "bounce" | "jelly";
  };
  feel: LookFeel;
  /** Pointer family from the cursor suite; applied only when Lens pointers are already on. */
  cursor: "obsidian" | "accent" | "glass" | "dot" | "outline" | "retro";
}

export const FONT_LABEL: Record<LookFont, string> = {
  "rounded-arial": "Rounded",
  "inter-sans": "Modern sans",
  "tech-mono": "Mono",
  "editorial-serif": "Serif",
};
export const FEEL_LABEL: Record<LookFeel, string> = { calm: "Calm", crisp: "Crisp", playful: "Playful" };

export const FEATURED_LOOKS: FeaturedLook[] = [
  { id: "obsidian", character: "Matte black glass with white chrome. The Lens default.", font: "rounded-arial", glass: 0.96, blur: 20, dock: { style: "floating", magnification: "off", launch: "lift" }, feel: "calm", cursor: "obsidian" },
  { id: "alabaster-daylight", character: "Bright daylight, white cards and one clear blue.", font: "inter-sans", glass: 0.98, blur: 16, dock: { style: "floating", magnification: "subtle", launch: "lift" }, feel: "crisp", cursor: "outline" },
  { id: "living-sky", character: "The real sky, live. Light by day, dark at night.", font: "inter-sans", glass: 0.8, blur: 28, dock: { style: "floating", magnification: "subtle", launch: "lift" }, feel: "calm", cursor: "glass" },
  { id: "catppuccin-mocha", character: "Cosy pastel mauve. Round, soft and bouncy.", font: "rounded-arial", glass: 0.92, blur: 24, dock: { style: "floating", magnification: "classic", launch: "bounce" }, feel: "playful", cursor: "accent" },
  { id: "hyprland-neon", character: "Tiling-rig neon: glowing cyan borders and split pills.", font: "tech-mono", glass: 0.78, blur: 30, dock: { style: "split", magnification: "off", launch: "none" }, feel: "crisp", cursor: "accent" },
  { id: "cyberpunk-amber", character: "Hard corners and electric yellow on a full-width bar.", font: "tech-mono", glass: 1, blur: 0, dock: { style: "taskbar", magnification: "off", launch: "none" }, feel: "crisp", cursor: "retro" },
  { id: "paper-minimal", character: "Warm paper and terracotta ink. Borderless and bookish.", font: "editorial-serif", glass: 1, blur: 0, dock: { style: "slim", magnification: "off", launch: "lift" }, feel: "calm", cursor: "outline" },
  { id: "lens-expressive", character: "Playful shapes: pill tiles, a scalloped clock, dock islands.", font: "rounded-arial", glass: 0.94, blur: 22, dock: { style: "islands", magnification: "classic", launch: "jelly" }, feel: "playful", cursor: "dot" },
  { id: "lens-dot-matrix", character: "LED-dot numerals and flat monochrome tiles.", font: "tech-mono", glass: 1, blur: 0, dock: { style: "islands", magnification: "off", launch: "none" }, feel: "crisp", cursor: "dot" },
  { id: "everforest-dark", character: "Forest green-grey with moss highlights. Quiet chrome.", font: "inter-sans", glass: 0.95, blur: 18, dock: { style: "minimal", magnification: "off", launch: "lift" }, feel: "calm", cursor: "obsidian" },
  { id: "solarized-matte", character: "Classic teal Solarized, matte, with a labelled studio dock.", font: "inter-sans", glass: 1, blur: 0, dock: { style: "studio", magnification: "off", launch: "lift" }, feel: "crisp", cursor: "outline" },
  { id: "gruvbox-warm", character: "Retro warm grey and orange with squared corners.", font: "rounded-arial", glass: 0.97, blur: 12, dock: { style: "taskbar", magnification: "subtle", launch: "lift" }, feel: "calm", cursor: "retro" },
];

const LOOK_BY_ID = new Map(FEATURED_LOOKS.map((l) => [l.id, l]));

export const featuredLook = (id: string | null | undefined): FeaturedLook | undefined => (id ? LOOK_BY_ID.get(id) : undefined);
export const isFeatured = (id: string | null | undefined): boolean => !!id && LOOK_BY_ID.has(id);

/** A featured look's pack with the look's Dock style, for previews and distance checks. */
export function lookPack(look: FeaturedLook): ThemePack {
  const pack = packById(look.id);
  if (!pack) throw new Error(`featured look without a pack: ${look.id}`);
  return { ...pack, dockStyle: look.dock.style, description: look.character };
}

/** The featured packs in display order. */
let featuredCache: ThemePack[] | null = null;

/** The twelve featured packs, in display order. Built once: they are all built-in packs. */
export function featuredPacks(): ThemePack[] {
  if (!featuredCache) featuredCache = FEATURED_LOOKS.map(lookPack);
  return featuredCache;
}

/** Everything that is not featured, in registry order. */
export function morePacks(): ThemePack[] {
  return allPacks().filter((p) => !LOOK_BY_ID.has(p.id));
}

/** The featured look a pack most resembles (itself when it is featured). */
export function familyOf(pack: ThemePack): ThemePack {
  if (LOOK_BY_ID.has(pack.id)) return featuredPacks().find((p) => p.id === pack.id) ?? lookPack(LOOK_BY_ID.get(pack.id)!);
  return nearest(pack, featuredPacks())?.pack ?? featuredPacks()[0];
}

/** Distance between two looks: the packs' distance plus the parts only a look defines. */
export function lookDistance(a: FeaturedLook, b: FeaturedLook): number {
  const differs = (x: unknown, y: unknown, cost: number) => (x === y ? 0 : cost);
  return (
    packDistance(lookPack(a), lookPack(b)) +
    differs(a.font, b.font, 0.08) +
    differs(a.feel, b.feel, 0.04) +
    0.2 * Math.abs(a.glass - b.glass)
  );
}

/** The scene each look shows behind the desktop (unique across the featured set). */
export const lookScene = (look: FeaturedLook): string => packScene(lookPack(look));

/**
 * A new config with the whole look applied: the pack (colours, radius, icons, folders, frame,
 * buttons, shape style), then the font, glass, blur, Dock style and Dock motion.
 * Packs that are not featured fall back to `applyThemePack`.
 */
export function applyFeaturedLook(config: LensConfig, id: string): LensConfig {
  const look = LOOK_BY_ID.get(id);
  if (!look) return applyThemePack(config, id);
  const next = applyThemePack(config, id);
  return {
    ...next,
    theme: { ...next.theme, fontFamily: look.font, glassOpacity: look.glass, blurPx: look.blur },
    dock: { ...next.dock, style: look.dock.style, magnification: look.dock.magnification, launchAnimation: look.dock.launch },
  };
}

/** True when `config` already shows this look in full. */
export function lookApplied(config: LensConfig, id: string): boolean {
  const look = LOOK_BY_ID.get(id);
  if (!look || config.theme.preset !== id) return false;
  return (
    (config.theme.fontFamily ?? "rounded-arial") === look.font &&
    Math.abs(config.theme.glassOpacity - look.glass) < 0.005 &&
    config.theme.blurPx === look.blur &&
    (config.dock.style ?? "floating") === look.dock.style
  );
}
