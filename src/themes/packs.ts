import type { LensConfig } from "../types/lens";

/**
 * Lens UI Theme Pack registry — the single source of truth for every built-in theme.
 * Control Center, Quick Settings, the Setup Wizard and the natural-language router all
 * read from here, so a pack looks and behaves the same no matter where it is applied.
 *
 * To add a pack: append one entry below. Nothing else needs to change.
 */
export interface ThemePack {
  id: string;
  label: string;
  tier: "Core" | "Linux Suite" | "Studio" | "Light" | "Custom";
  /** Light packs flip the ink/foreground tokens (tokens.css `[data-scheme="light"]`). */
  scheme?: "light";
  /** Solid surface base. Omitted for Obsidian, which uses the stock tokens.css values. */
  base?: string;
  accent: string;
  /** "windows" follows the live OS accent instead of `accent`. */
  accentMode: "custom" | "windows";
  tint: number;
  radius: number;
  iconTheme: string;
  iconShape: string;
  folderTheme: string;
  frameStyle: string;
  controlStyle: string;
  /** Words the natural-language router matches ("catppuccin theme", "nord", ...). */
  aliases: string[];
}

export const THEME_PACKS: ThemePack[] = [
  // ---- Core ----
  { id: "obsidian", label: "Obsidian", tier: "Core", accent: "#FAFAFA", accentMode: "custom", tint: 0, radius: 8, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "obsidian", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", aliases: ["obsidian"] },
  { id: "windows-mesh", label: "Windows Mesh", tier: "Core", base: "#0D1017", accent: "#2D7D9A", accentMode: "windows", tint: 0.16, radius: 8, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "accent", frameStyle: "accent-glow", controlStyle: "traffic-muted", aliases: ["mesh", "windows mesh"] },
  { id: "graphite", label: "Graphite", tier: "Core", base: "#141417", accent: "#A1A1AA", accentMode: "custom", tint: 0, radius: 10, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "minimal", frameStyle: "obsidian-hairline", controlStyle: "minimal-dots", aliases: ["graphite", "stealth"] },
  { id: "midnight", label: "Midnight", tier: "Core", base: "#050507", accent: "#60A5FA", accentMode: "custom", tint: 0, radius: 8, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "neon", frameStyle: "neon", controlStyle: "accent-pills", aliases: ["midnight"] },

  // ---- Linux Suite ----
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", tier: "Linux Suite", base: "#11111B", accent: "#CBA6F7", accentMode: "custom", tint: 0, radius: 12, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "violet", frameStyle: "accent-glow", controlStyle: "traffic-muted", aliases: ["catppuccin", "mocha"] },
  { id: "tokyo-night", label: "Tokyo Night", tier: "Linux Suite", base: "#0F111A", accent: "#7AA2F7", accentMode: "custom", tint: 0, radius: 10, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "accent-glow", controlStyle: "traffic-classic", aliases: ["tokyo night", "tokyonight", "tokyo"] },
  { id: "nord-frost", label: "Nord Frost", tier: "Linux Suite", base: "#1B2029", accent: "#88C0D0", accentMode: "custom", tint: 0, radius: 8, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "frost", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", aliases: ["nord"] },
  { id: "dracula-glass", label: "Dracula Glass", tier: "Linux Suite", base: "#14151F", accent: "#BD93F9", accentMode: "custom", tint: 0, radius: 10, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "violet", frameStyle: "accent-glow", controlStyle: "traffic-classic", aliases: ["dracula"] },
  { id: "gruvbox-warm", label: "Gruvbox Warm", tier: "Linux Suite", base: "#1D1A18", accent: "#FABD2F", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "amber", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", aliases: ["gruvbox"] },
  { id: "kanagawa-wave", label: "Kanagawa Wave", tier: "Linux Suite", base: "#16161D", accent: "#7E9CD8", accentMode: "custom", tint: 0, radius: 10, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", aliases: ["kanagawa"] },
  { id: "rose-pine", label: "Rosé Pine", tier: "Linux Suite", base: "#191724", accent: "#EBBCBA", accentMode: "custom", tint: 0, radius: 12, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "rose", frameStyle: "accent-glow", controlStyle: "traffic-muted", aliases: ["rose pine", "rosé pine", "rosepine"] },
  { id: "everforest-dark", label: "Everforest", tier: "Linux Suite", base: "#1E2326", accent: "#A7C080", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "emerald", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", aliases: ["everforest"] },
  { id: "hyprland-neon", label: "Hyprland Neon", tier: "Linux Suite", base: "#0A0C12", accent: "#38BDF8", accentMode: "custom", tint: 0, radius: 14, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "neon", frameStyle: "neon", controlStyle: "accent-pills", aliases: ["hyprland"] },

  // ---- Studio ----
  { id: "sequoia-frost", label: "Sequoia Frost", tier: "Studio", base: "#141519", accent: "#0A84FF", accentMode: "custom", tint: 0, radius: 14, iconTheme: "native", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", aliases: ["sequoia", "macos"] },
  { id: "cyberpunk-amber", label: "Cyberpunk Amber", tier: "Studio", base: "#0D0B09", accent: "#F59E0B", accentMode: "custom", tint: 0, radius: 4, iconTheme: "obsidian-squircle", iconShape: "rounded", folderTheme: "ember", frameStyle: "neon", controlStyle: "accent-pills", aliases: ["cyberpunk"] },
  { id: "solarized-matte", label: "Solarized Matte", tier: "Studio", base: "#07242B", accent: "#2AA198", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "frost", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", aliases: ["solarized"] },

  // ---- Light (first cut: surfaces and text are tokenized; a few accents are still tuned for dark) ----
  { id: "alabaster-daylight", label: "Alabaster Daylight", tier: "Light", scheme: "light", base: "#F4F4F5", accent: "#18181B", accentMode: "custom", tint: 0, radius: 10, iconTheme: "native", iconShape: "squircle", folderTheme: "minimal", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", aliases: ["alabaster", "daylight", "light"] },
  { id: "paper-minimal", label: "Paper Minimal", tier: "Light", scheme: "light", base: "#FAFAF9", accent: "#2563EB", accentMode: "custom", tint: 0, radius: 8, iconTheme: "native", iconShape: "borderless", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", aliases: ["paper"] },
];

/** Every folder icon style the native .ico generator (win_folders.rs) and the Dock know how to draw. */
export const FOLDER_THEMES: { id: string; label: string }[] = [
  { id: "accent", label: "Accent" },
  { id: "obsidian", label: "Matte" },
  { id: "minimal", label: "Minimal" },
  { id: "cobalt", label: "Cobalt" },
  { id: "emerald", label: "Emerald" },
  { id: "amber", label: "Amber" },
  { id: "rose", label: "Rose" },
  { id: "violet", label: "Violet" },
  { id: "frost", label: "Frost" },
  { id: "ember", label: "Ember" },
  { id: "neon", label: "Neon" },
];

/** Window frame (border) styles applied to every app window through DWM. */
export const FRAME_STYLES: { id: string; label: string }[] = [
  { id: "obsidian-hairline", label: "Hairline" },
  { id: "accent-glow", label: "Accent" },
  { id: "neon", label: "Neon" },
  { id: "none", label: "Borderless" },
];

/** Ids the rest of the app understands; custom packs may only pick from these. */
export const ICON_THEMES = ["obsidian-squircle", "frosted-glass", "monochrome", "accent-duotone", "native"];
export const ICON_SHAPES = ["squircle", "rounded", "circle", "borderless"];
export const CONTROL_STYLES = ["traffic-classic", "traffic-muted", "minimal-dots", "accent-pills"];

/**
 * Custom packs: user-made packs carried inside `.lenstheme` files (see lenstheme.ts).
 * They live in a runtime registry, always under an id starting with "custom-", so they can
 * never shadow or replace a built-in pack. Each surface window has its own registry and
 * fills it from the saved theme files at startup (customPacks.ts).
 */
export const CUSTOM_PACK_PREFIX = "custom-";
const customPacks = new Map<string, ThemePack>();

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Strictly validates an untrusted custom-pack definition. Returns a complete ThemePack with
 * a "custom-…" id, or null if the definition is unusable. Never throws.
 */
export function validateCustomPack(raw: unknown): ThemePack | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const hexOk = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  const pick = (v: unknown, allowed: string[], fallback: string) =>
    typeof v === "string" && allowed.includes(v) ? v : fallback;
  if (!hexOk(r.base) || !hexOk(r.accent)) return null;

  const rawId = typeof r.id === "string" ? r.id : typeof r.label === "string" ? r.label : "";
  const slug = rawId
    .toLowerCase()
    .replace(new RegExp("^" + CUSTOM_PACK_PREFIX), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (!slug) return null;

  const base = r.base.toUpperCase();
  const accent = r.accent.toUpperCase();
  const light =
    r.scheme === "light" ? true : r.scheme === "dark" ? false : relLuminance(base) > 0.4;
  // A scheme that contradicts the surface would make text unreadable: reject it.
  if (contrastRatio(base, light ? "#18181B" : "#FAFAFA") < 4.5) return null;

  const label =
    typeof r.label === "string" && /^[\w .'&-]{1,40}$/.test(r.label.trim()) ? r.label.trim() : slug;
  const radius =
    typeof r.radius === "number" && Number.isFinite(r.radius)
      ? Math.round(Math.min(20, Math.max(0, r.radius)))
      : 8;
  const pack: ThemePack = {
    id: CUSTOM_PACK_PREFIX + slug,
    label,
    tier: "Custom",
    base,
    accent,
    accentMode: "custom",
    tint: 0,
    radius,
    iconTheme: pick(r.iconTheme, ICON_THEMES, light ? "native" : "obsidian-squircle"),
    iconShape: pick(r.iconShape, ICON_SHAPES, "squircle"),
    folderTheme: pick(r.folderTheme, FOLDER_THEMES.map((f) => f.id), "accent"),
    frameStyle: pick(r.frameStyle, FRAME_STYLES.map((f) => f.id), "obsidian-hairline"),
    controlStyle: pick(r.controlStyle, CONTROL_STYLES, "traffic-classic"),
    aliases: [],
  };
  if (light) pack.scheme = "light";
  return pack;
}

/** Validates and registers a custom pack. Returns the registered pack, or null if invalid. */
export function registerCustomPack(raw: unknown): ThemePack | null {
  const pack = validateCustomPack(raw);
  if (pack) customPacks.set(pack.id, pack);
  return pack;
}

export function unregisterCustomPack(id: string): void {
  customPacks.delete(id);
}

export function listCustomPacks(): ThemePack[] {
  return [...customPacks.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Built-in packs followed by registered custom packs. */
export function allPacks(): ThemePack[] {
  return [...THEME_PACKS, ...listCustomPacks()];
}

/** The plain definition written into a `.lenstheme` file for a custom pack. */
export function customPackDefinition(pack: ThemePack): Record<string, unknown> {
  return {
    id: pack.id,
    label: pack.label,
    base: pack.base,
    accent: pack.accent,
    radius: pack.radius,
    scheme: pack.scheme === "light" ? "light" : "dark",
    iconTheme: pack.iconTheme,
    iconShape: pack.iconShape,
    folderTheme: pack.folderTheme,
    frameStyle: pack.frameStyle,
    controlStyle: pack.controlStyle,
  };
}

export function packById(id: string | undefined | null): ThemePack | undefined {
  if (!id) return undefined;
  return THEME_PACKS.find((p) => p.id === id) ?? customPacks.get(id);
}

export function packByAlias(phrase: string): ThemePack | undefined {
  const p = phrase.trim().toLowerCase();
  return THEME_PACKS.find((pack) => pack.id === p || pack.aliases.includes(p));
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Lifts a hex color toward white by `amount` (0..1) — used for the elevated glass layer. */
export function lighten(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const ch = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (
    "#" +
    ch
      .map((v) => clamp255(v + (255 - v) * amount).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** A two-stop swatch for pack pickers. */
export function packSwatch(pack: ThemePack): string {
  const base = pack.base ?? "#09090B";
  if (pack.accent.toUpperCase() === "#FAFAFA") return `linear-gradient(135deg, ${base}, #27272A)`;
  return `linear-gradient(135deg, ${base} 0%, ${base} 55%, ${pack.accent} 56%, ${pack.accent} 100%)`;
}

/** Returns a new config with every part of the pack applied together (surface, accent, icons, folders, window frame). */
export function applyThemePack(config: LensConfig, packId: string): LensConfig {
  const pack = packById(packId);
  if (!pack) return config;
  return {
    ...config,
    theme: {
      ...config.theme,
      preset: pack.id,
      accentMode: pack.accentMode,
      customAccent: pack.accentMode === "custom" ? pack.accent : config.theme.customAccent,
      accentTintStrength: pack.tint,
      borderRadius: pack.radius,
      surfaceHex: pack.base ?? "",
    },
    iconStyle: { theme: pack.iconTheme, shape: pack.iconShape },
    windowControls: {
      ...config.windowControls,
      style: pack.controlStyle,
      frameStyle: pack.frameStyle,
    },
    folderStyle: {
      ...(config.folderStyle ?? { theme: "accent", globalExplorerOverride: false }),
      theme: pack.folderTheme,
    },
    dock: {
      ...config.dock,
      pinnedFolders: config.dock.pinnedFolders.map((f) => ({ ...f, theme: pack.folderTheme })),
    },
  };
}
