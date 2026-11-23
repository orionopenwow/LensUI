/**
 * The wallpapers Lens draws itself, listed beside your own files: Backdrop Lab presets (shaders)
 * and the living themes' wallpapers. They play through the same wallpaper host and frame budgets
 * as everything else (docs/BACKDROP_LAB.md, docs/LIVING_THEMES.md).
 */
import { allPresets, cssGradient, packPalette, tidyStops } from "../studio/backdrop/engine";
import { LIVING_PACKS } from "../themes/living/packs";
import { EMPTY_META, type Card } from "./model";

function five(colours: string[]): string[] {
  const out = colours.slice(0, 5);
  while (out.length < 5) out.push(out[out.length - 1] ?? "#1B1B22");
  return out.map((c) => c.toUpperCase());
}

/** Evenly picks five colours across a gradient's stops. */
function spread(colours: string[]): string[] {
  if (colours.length <= 5) return five(colours);
  return five([0, 1, 2, 3, 4].map((i) => colours[Math.round((i / 4) * (colours.length - 1))]));
}

let cache: Card[] | null = null;

export function virtualCards(): Card[] {
  if (cache) return cache;
  const living: Card[] = LIVING_PACKS.map((p) => {
    const base = p.base ?? "#0B1230";
    const palette = five(packPalette(base, p.accent));
    return {
      id: `living:${p.id}`,
      kind: "living",
      name: p.label,
      detail: "Living wallpaper",
      thumb: "",
      art: `radial-gradient(110% 90% at 72% 18%, ${p.accent}66 0%, transparent 60%), linear-gradient(165deg, ${palette[1]}, ${base} 70%)`,
      palette,
      meta: { ...EMPTY_META, tags: ["living"] },
    };
  });
  const presets: Card[] = allPresets().map((p) => ({
    id: `preset:${p.id}`,
    kind: "preset",
    name: p.name,
    detail: `Backdrop Lab · ${p.group}`,
    thumb: "",
    art: cssGradient(p.state),
    palette: spread(tidyStops(p.state.stops).map((s) => s.color)),
    meta: { ...EMPTY_META, tags: [p.group.toLowerCase()] },
  }));
  cache = [...living, ...presets];
  return cache;
}
