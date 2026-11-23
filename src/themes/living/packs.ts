/**
 * Living Themes packs: each pairs a theme pack with its living wallpaper (same id as the
 * Playground scene). The `base`/`accent` here are the night look; while a living pack is active
 * the tint controller (./tint.ts) moves Lens to a light scheme by day and back at night, using
 * the same sunrise/sunset logic as the Theme Schedule, and (optionally) tints the glass and
 * accent with the sky. See docs/LIVING_THEMES.md.
 */
import type { ThemePack } from "../packs";

const common = {
  tier: "Living" as const,
  accentMode: "custom" as const,
  tint: 0.12,
  iconTheme: "frosted-glass",
  iconShape: "squircle",
  frameStyle: "obsidian-hairline",
  controlStyle: "traffic-muted",
  dockStyle: "floating",
};

export const LIVING_PACKS: ThemePack[] = [
  { ...common, id: "living-sky", label: "Sky", base: "#0B1230", accent: "#A9B8EE", radius: 16, folderTheme: "frost", description: "The real sky outside, live: the Sun and Moon move with your time of day. Light by day, dark at night.", aliases: ["sky", "living sky", "live sky", "real sky"] },
  { ...common, id: "living-moonlight", label: "Moonlight", base: "#070B1C", accent: "#C9D4F2", radius: 14, folderTheme: "frost", description: "Tonight's Moon in its real phase, with the season's constellation.", aliases: ["moonlight", "moon"] },
  { ...common, id: "living-seasons", label: "Seasons", base: "#101A14", accent: "#9CC48A", radius: 14, folderTheme: "emerald", description: "Blossom, summer, autumn leaves or snow, by date and hemisphere.", aliases: ["seasons", "seasonal"] },
  { ...common, id: "living-golden-hour", label: "Golden Hour", base: "#1A1020", accent: "#FFB870", radius: 16, folderTheme: "amber", description: "Calm cream by day, glowing amber that peaks at your real sunset.", aliases: ["golden hour", "sunset"] },
  { ...common, id: "living-weather", label: "Weather Window", base: "#12161E", accent: "#9DB4CC", radius: 12, folderTheme: "frost", description: "The sky through a window with your weather. Live weather is opt-in.", aliases: ["weather", "weather window", "rain"] },
  { ...common, id: "living-tides", label: "Tides of Light", base: "#081620", accent: "#7FC8D8", radius: 14, folderTheme: "frost", description: "A sea horizon mirroring the sky; the shore follows the Moon's tide.", aliases: ["tides", "tides of light", "ocean", "sea"] },
  { ...common, id: "living-city-night", label: "City Night", base: "#0A0C16", accent: "#FFC670", radius: 10, folderTheme: "amber", description: "A skyline whose windows light up after your sunset.", aliases: ["city night", "city", "skyline"] },
  { ...common, id: "living-aurora", label: "Northern Lights", base: "#04121A", accent: "#6CF0B0", radius: 14, folderTheme: "emerald", description: "Green aurora curtains over snowy peaks on dark nights.", aliases: ["northern lights", "aurora", "aurora borealis"] },
  { ...common, id: "living-desert", label: "Desert Day", base: "#1C130E", accent: "#E8B070", radius: 12, folderTheme: "ember", description: "Dunes whose shadows follow the real Sun.", aliases: ["desert", "desert day", "dunes"] },
];

export const LIVING_PACK_IDS = new Set(LIVING_PACKS.map((p) => p.id));

export function isLivingPack(id: string | null | undefined): boolean {
  return !!id && LIVING_PACK_IDS.has(id);
}
