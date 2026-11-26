/**
 * Backdrop Lab presets: all original to Lens (names, palettes and settings).
 * Pack presets are generated from the built-in theme packs' base + accent (see packPresets()).
 */
import { evenStops, gamutMapOklch, hexToRgb, mixIn, rgbToHex, srgbToOklch, type Vec3 } from "./color";
import type { ModeId } from "./modes";
import { defaultState, normaliseState, type BackdropState } from "./state";

export type PresetGroup = "Lens" | "Soft" | "Light" | "Nature" | "Pattern" | "Glass" | "Packs";

export interface Preset {
  id: string;
  name: string;
  group: PresetGroup;
  /** 0 calm … 1 energetic */
  energy: number;
  /** 0 cool … 1 warm */
  warmth: number;
  state: BackdropState;
}

type Over = Partial<Omit<BackdropState, "params">> & { params?: Record<string, number> };

function make(id: string, name: string, group: PresetGroup, mode: ModeId, colors: string[], o: Over = {}, energy = 0.4, warmth = 0.5): Preset {
  const base = defaultState(mode);
  const state = normaliseState({
    ...base,
    ...o,
    name,
    stops: evenStops(colors),
    params: { ...base.params, ...(o.params ?? {}) },
  });
  return { id, name, group, energy, warmth, state };
}

export const PRESETS: Preset[] = [
  // ── Lens signature ──
  make("lens-nebula", "Lens Nebula", "Lens", "nebula", ["#05040B", "#1B1342", "#5B3FD9", "#C084FC", "#FDF4FF"], { speed: 0.12, warp: 0.25, softness: 0.55, bloom: 0.35, grain: 0.018, vignette: 0.35, tone: "aces", exposure: 0.2, params: { a: 0.9, b: 0.7 } }, 0.3, 0.35),
  make("lens-obsidian-glow", "Obsidian Glow", "Lens", "mesh", ["#050506", "#0E0E12", "#1C1C24", "#3A3A48", "#9A9AAE"], { speed: 0.1, warp: 0.22, softness: 0.4, grain: 0.022, vignette: 0.4 }, 0.15, 0.4),
  make("lens-aperture", "Aperture", "Lens", "eclipse", ["#020203", "#0B0B10", "#3B2F8F", "#A78BFA", "#FFFFFF"], { speed: 0.1, bloom: 0.4, params: { a: 0.75, b: 0.6 }, tone: "aces" }, 0.2, 0.35),
  // The Lens cloud: the logo's six hues (src/styles/lens-cloud.css) billowing out of near-black.
  // Lens's one colour moment as a backdrop; slow, so it reads as matte and never as a light show.
  make("lens-cloud", "Lens Cloud", "Lens", "nebula", ["#050507", "#FA3838", "#FAC72E", "#16F360", "#2EC7FA", "#7F56FB", "#FA42E8"], { speed: 0.08, warp: 0.3, softness: 0.6, bloom: 0.25, grain: 0.02, vignette: 0.45, tone: "aces", exposure: -0.15, params: { a: 0.9, b: 0.7 } }, 0.3, 0.5),

  // ── Soft ──
  make("soft-peach-mist", "Peach Mist", "Soft", "mesh", ["#2A1630", "#7A3E6E", "#E9788C", "#FFB996", "#FFE9D2"], { speed: 0.16, softness: 0.55 }, 0.3, 0.85),
  make("soft-lagoon", "Lagoon", "Soft", "mesh", ["#03141C", "#08415C", "#0E8C93", "#5BD6C0", "#D9FFF5"], { speed: 0.14, warp: 0.3 }, 0.3, 0.15),
  make("soft-lilac-hour", "Lilac Hour", "Soft", "mesh", ["#140F2A", "#3F2D7A", "#8F6BD9", "#E7A6E6", "#FCE7F3"], { speed: 0.12, params: { a: 6, b: 1.1, c: 0.5 } }, 0.25, 0.55),
  make("soft-tidal-bands", "Tidal Bands", "Soft", "bands", ["#071526", "#11406B", "#2C7DA0", "#8ECAE6", "#F1FAFF"], { speed: 0.2, softness: 0.9, params: { a: 20, b: 0.9 } }, 0.35, 0.2),
  make("soft-ember-bands", "Ember Bands", "Soft", "bands", ["#1A0A06", "#5C1A0B", "#C2410C", "#FB923C", "#FFEDD5"], { speed: 0.24, sharpness: 0.2, params: { a: 140, b: 1.6 } }, 0.5, 0.95),
  make("soft-lava-lamp", "Lava Lamp", "Soft", "plasma", ["#16001E", "#5B0A6B", "#E11D74", "#FF8A3D", "#FFE8A3"], { speed: 0.3, softness: 0.6 }, 0.7, 0.85),
  make("soft-ink-drift", "Ink Drift", "Soft", "smoke", ["#05060A", "#11182B", "#2E3A73", "#7F8CFF", "#E3E8FF"], { speed: 0.12, warp: 0.4, params: { a: 1.2 } }, 0.3, 0.2),
  make("soft-rose-smoke", "Rose Smoke", "Soft", "smoke", ["#14070C", "#4A1426", "#B23A5F", "#F49AB8", "#FFF0F5"], { speed: 0.14, softness: 0.85 }, 0.35, 0.75),

  // ── Light ──
  make("light-gallery-beam", "Gallery Beam", "Light", "beam", ["#12030A", "#4C0A26", "#B4123F", "#F7516A", "#FFE1E6"], { speed: 0.1, softness: 0.5, bloom: 0.3, params: { a: 1.2, b: 0.7 } }, 0.3, 0.8),
  make("light-cold-beam", "Cold Beam", "Light", "beam", ["#02040A", "#0B1A3A", "#1F4FB8", "#6EA8FF", "#EAF2FF"], { speed: 0.1, softness: 0.35, bloom: 0.35, handles: [{ x: 0.62, y: 0.3 }, { x: 0.3, y: 0.75 }] }, 0.3, 0.15),
  make("light-cathedral", "Cathedral", "Light", "rays", ["#07060A", "#231C2E", "#6B5A8E", "#E4C9A8", "#FFF8EC"], { speed: 0.08, softness: 0.6, bloom: 0.25, params: { a: 9, b: 0.6 } }, 0.2, 0.65),
  make("light-dawn-line", "Dawn Line", "Light", "horizon", ["#0A0712", "#2A1840", "#8C3D6B", "#F59E6B", "#FFF1D6"], { speed: 0.1, softness: 0.55, params: { a: 1.2, b: 0.6 } }, 0.2, 0.8),
  make("light-edge-of-night", "Edge of Night", "Light", "edgeglow", ["#010206", "#061024", "#0E3A7A", "#5FB0FF", "#F2FAFF"], { speed: 0.1, bloom: 0.45, params: { a: 1.6, b: 0.8 } }, 0.25, 0.1),
  make("light-mint-edge", "Mint Edge", "Light", "edgeglow", ["#0B130F", "#1D3A2C", "#3F7A5C", "#9FE3BF", "#F3FFF8"], { speed: 0.1, bloom: 0.3, handles: [{ x: 0.42, y: 0.66 }] }, 0.2, 0.35),
  make("light-corona", "Corona", "Light", "eclipse", ["#020101", "#1C0905", "#8A2A06", "#FFA94D", "#FFF6E0"], { speed: 0.14, bloom: 0.5, tone: "aces", params: { a: 0.6, b: 0.8 } }, 0.4, 0.9),
  make("light-hyperspace", "Hyperspace", "Light", "tunnel", ["#01020A", "#06123A", "#1846C7", "#7CB4FF", "#FFFFFF"], { speed: 0.3, bloom: 0.45, params: { a: 9, b: 0.8 } }, 0.85, 0.1),
  make("light-festival", "Festival Lights", "Light", "bokeh", ["#0B0614", "#2A1240", "#B03A8C", "#FFB34D", "#FFF4D6"], { speed: 0.2, params: { a: 0.5, b: 1.1 } }, 0.55, 0.8),
  make("light-prism", "Prism", "Light", "prism", ["#06070B", "#E63946", "#F4A261", "#E9C46A", "#2A9D8F", "#457B9D", "#7B2CBF"], { speed: 0.12, space: "oklch", softness: 0.5, bloom: 0.25, params: { a: 125, b: 0.28 } }, 0.4, 0.5),

  // ── Nature ──
  make("nature-polar-curtain", "Polar Curtain", "Nature", "curtains", ["#030712", "#0B2545", "#13A07B", "#8CF5C8", "#F0FFF9"], { speed: 0.16, bloom: 0.3, params: { a: 1.4, b: 0.3, c: 0.6 } }, 0.35, 0.2),
  make("nature-stage-curtain", "Stage Curtain", "Nature", "curtains", ["#120208", "#4A0B23", "#C21E56", "#FF7BA3", "#FFE6EF"], { speed: 0.14, params: { a: 2.2, b: 0.15, c: 0.5 } }, 0.35, 0.8),
  make("nature-pool-floor", "Pool Floor", "Nature", "caustics", ["#022C3A", "#04647A", "#13A8B8", "#9EF0F0", "#FFFFFF"], { speed: 0.22, params: { a: 1.1 } }, 0.5, 0.15),
  make("nature-moon-sea", "Moon Sea", "Nature", "sea", ["#03040C", "#101A3A", "#3A4F8F", "#B8C4F2", "#FFFFFF"], { speed: 0.14, bloom: 0.3, params: { a: 0.3, b: 0.8, c: 0.8 } }, 0.25, 0.15),
  make("nature-violet-sea", "Violet Sea", "Nature", "sea", ["#120A2A", "#3B1F73", "#8C5BD9", "#E9C9FF", "#FFFFFF"], { speed: 0.16, bloom: 0.25, params: { a: 0.15, b: 1.2, c: 0.7 } }, 0.3, 0.55),
  make("nature-afternoon-wall", "Afternoon Wall", "Nature", "window", ["#3A2A1C", "#7A5B3E", "#C69B6D", "#F2D2A9", "#FFF5E6"], { speed: 0.12, grain: 0.03, grainStyle: "paper", params: { a: 0.35, b: 1, c: 0.7 } }, 0.15, 0.85),
  make("nature-blue-hour-wall", "Blue Hour Wall", "Nature", "window", ["#0E1420", "#1F2C45", "#3E5A86", "#9CB7DE", "#EEF4FF"], { speed: 0.1, grain: 0.025, grainStyle: "paper", params: { a: -0.3, b: 1.1, c: 0.5 }, handles: [{ x: 0.45, y: 0.45 }] }, 0.15, 0.2),
  make("nature-sky-islands", "Sky Islands", "Nature", "pixelscape", ["#1B1F3B", "#4F6DB8", "#9DB4E8", "#F5B7C9", "#FFF4F7"], { speed: 0.2, dither: "ordered", params: { a: 1, b: 6 } }, 0.4, 0.5),
  make("nature-orbit-dawn", "Orbit Dawn", "Nature", "planet", ["#000104", "#04101F", "#0B5E6B", "#4FF0D2", "#F2FFFC"], { speed: 0.1, bloom: 0.45, params: { a: 1.1, b: 0.6 } }, 0.2, 0.25),
  make("nature-red-giant", "Red Giant", "Nature", "planet", ["#030001", "#1C0306", "#7A0F17", "#FF6A3D", "#FFE7CF"], { speed: 0.1, bloom: 0.4, handles: [{ x: 0.4, y: 0.62 }], params: { a: 0.8, b: 0.4 } }, 0.25, 0.9),

  // ── Pattern ──
  make("pattern-carrara", "Carrara", "Pattern", "marble", ["#1B1B1F", "#55555E", "#B9B9C2", "#ECECF1", "#FFFFFF"], { speed: 0.06, softness: 0.5, warp: 0.25, params: { a: 1.6 } }, 0.1, 0.45),
  make("pattern-malachite", "Malachite", "Pattern", "marble", ["#011A12", "#06402B", "#0E7A4F", "#4FD59A", "#D7FFEA"], { speed: 0.08, softness: 0.35, params: { a: 3 } }, 0.2, 0.25),
  make("pattern-leaded-glass", "Leaded Glass", "Pattern", "cells", ["#0A0A12", "#273B7A", "#D9455F", "#F2B53B", "#F8F1E3"], { speed: 0.12, sharpness: 0.6, params: { a: 0.4, b: 0.1, c: 0.6 } }, 0.35, 0.65),
  make("pattern-dot-sun", "Dot Sun", "Pattern", "halftone", ["#0B0420", "#26105E", "#6D3FE0", "#F0A3FF", "#FFF2FF"], { speed: 0.1, params: { a: 1.1, b: 0.4 } }, 0.25, 0.5),
  make("pattern-mandala", "Mandala", "Pattern", "kaleido", ["#0A0614", "#3B1060", "#C2357F", "#FFB37A", "#FFF7E8"], { speed: 0.18, params: { a: 8, b: 1.1 } }, 0.6, 0.75),
  make("pattern-midnight-tiles", "Midnight Tiles", "Pattern", "tiles", ["#000105", "#030A24", "#14318F", "#5D8BFF", "#EEF3FF"], { speed: 0.1, bloom: 0.3, params: { a: 1, b: 0.35, c: 0.5 } }, 0.2, 0.1),
  make("pattern-copper-tiles", "Copper Tiles", "Pattern", "tiles", ["#050302", "#1F120A", "#7A4220", "#E39A5A", "#FFF0E0"], { speed: 0.1, softness: 0.4, params: { a: 1.4, b: 0.25, c: 0.6 } }, 0.2, 0.85),

  // ── Glass ──
  make("glass-fluted-dusk", "Fluted Dusk", "Glass", "glass", ["#0E0A1F", "#3C2373", "#B04E9E", "#FFA07A", "#FFF0E1"], { speed: 0.14, params: { a: 1.4, b: 0.6 } }, 0.3, 0.7),
  make("glass-ice-flutes", "Ice Flutes", "Glass", "glass", ["#06101A", "#18405E", "#4E9AC7", "#BDE6FF", "#FFFFFF"], { speed: 0.12, params: { a: 2.4, b: 0.4 } }, 0.25, 0.1),
  make("glass-rose-quartz", "Rose Quartz", "Glass", "shards", ["#1A0A14", "#5E1F45", "#C24D8A", "#F7B2D5", "#FFF0F8"], { speed: 0.1, params: { a: 0.8, b: 0.7 } }, 0.25, 0.65),
  make("glass-amethyst", "Amethyst", "Glass", "shards", ["#0B0616", "#2E1460", "#6E3BD1", "#C7A6FF", "#F6F0FF"], { speed: 0.1, softness: 0.3, params: { a: 0.9, b: 1 } }, 0.25, 0.45),
  make("glass-night-drive", "Night Drive", "Glass", "streaks", ["#05020C", "#1D0838", "#7A1FA2", "#FF4FA3", "#FFE3F1"], { speed: 0.35, aberration: 0.6, bloom: 0.3, params: { a: 28, b: 0.8 } }, 0.85, 0.65),
  make("glass-blue-rush", "Blue Rush", "Glass", "streaks", ["#01030A", "#071A40", "#1C5BD9", "#7FD3FF", "#FFFFFF"], { speed: 0.4, aberration: 0.5, params: { a: 152, b: 1.1 } }, 0.9, 0.1),
];

/** Built-in pack (id, label, base, accent) → a matching backdrop. Kept in step with src/themes/packs.ts by a test. */
export const PACK_SOURCES: { id: string; label: string; base: string; accent: string; light?: boolean }[] = [
  { id: "obsidian", label: "Obsidian", base: "#09090B", accent: "#FAFAFA" },
  { id: "windows-mesh", label: "Windows Mesh", base: "#0D1017", accent: "#2D7D9A" },
  { id: "graphite", label: "Graphite", base: "#18181C", accent: "#A1A1AA" },
  { id: "midnight", label: "Midnight", base: "#050507", accent: "#818CF8" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", base: "#1E1E2E", accent: "#CBA6F7" },
  { id: "tokyo-night", label: "Tokyo Night", base: "#1A1B26", accent: "#7AA2F7" },
  { id: "nord-frost", label: "Nord Frost", base: "#2E3440", accent: "#88C0D0" },
  { id: "dracula-glass", label: "Dracula Glass", base: "#282A36", accent: "#FF79C6" },
  { id: "gruvbox-warm", label: "Gruvbox Warm", base: "#282828", accent: "#FE8019" },
  { id: "kanagawa-wave", label: "Kanagawa Wave", base: "#1F1F28", accent: "#E46876" },
  { id: "rose-pine", label: "Rosé Pine", base: "#191724", accent: "#EBBCBA" },
  { id: "everforest-dark", label: "Everforest", base: "#2D353B", accent: "#A7C080" },
  { id: "hyprland-neon", label: "Hyprland Neon", base: "#0A0C12", accent: "#33CCFF" },
  { id: "sequoia-frost", label: "Sequoia Frost", base: "#1E1E20", accent: "#0A84FF" },
  { id: "cyberpunk-amber", label: "Cyberpunk Amber", base: "#0D0B09", accent: "#FCEE0A" },
  { id: "solarized-matte", label: "Solarized Matte", base: "#002B36", accent: "#2AA198" },
  { id: "alabaster-daylight", label: "Alabaster Daylight", base: "#EEEEF0", accent: "#2563EB", light: true },
  { id: "paper-minimal", label: "Paper Minimal", base: "#F5F1E8", accent: "#C2410C", light: true },
];

const PACK_MODES: ModeId[] = ["mesh", "smoke", "curtains", "beam", "edgeglow", "glass", "nebula", "sea", "bands"];

/** Five stops from a pack's base to its accent (and a light end), mixed in OKLCH. */
export function packPalette(base: string, accent: string, light = false): string[] {
  const b = hexToRgb(base);
  const a = hexToRgb(accent);
  const lch = srgbToOklch(a);
  const glow = rgbToHex(gamutMapOklch([Math.min(0.97, lch[0] + 0.25), lch[1] * 0.5, lch[2]]));
  if (light) {
    const deep = rgbToHex(gamutMapOklch([Math.max(0.35, lch[0] - 0.1), lch[1], lch[2]]));
    return [glow, rgbToHex(mixIn("oklch", b, hexToRgb(glow), 0.5)), base, rgbToHex(mixIn("oklch", b, a, 0.35)), deep];
  }
  const mid = (t: number): string => rgbToHex(mixIn("oklch", b, a, t) as Vec3);
  return [base, mid(0.25), mid(0.6), accent, glow];
}

export function packPresets(): Preset[] {
  return PACK_SOURCES.map((p, i) => {
    const mode = PACK_MODES[i % PACK_MODES.length];
    return make(`pack-${p.id}`, p.label, "Packs", mode, packPalette(p.base, p.accent, p.light), { speed: 0.12, softness: 0.6, grain: 0.018, vignette: p.light ? 0 : 0.25 }, 0.25, 0.5);
  });
}

let all: Preset[] | null = null;
export function allPresets(): Preset[] {
  if (!all) all = [...PRESETS, ...packPresets()];
  return all;
}

export function presetById(id: string | null | undefined): Preset | undefined {
  return id ? allPresets().find((p) => p.id === id) : undefined;
}

/** First-run default and the wallpaper fallback. */
export const HERO_PRESET_ID = "lens-nebula";
