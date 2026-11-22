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
  /** Dock layout this pack is designed around (see src/dock/styles.ts). Only applied when the user opts in. */
  dockStyle?: string;
  /** One of the six packs shown first in Control Center and the Setup Wizard. */
  recommended?: boolean;
  /** One-line, plain-language summary shown on the pack card. */
  description?: string;
  /** Words the natural-language router matches ("catppuccin theme", "nord", ...). */
  aliases: string[];
}

export const THEME_PACKS: ThemePack[] = [
  // ---- Core ----
  { id: "obsidian", label: "Obsidian", tier: "Core", accent: "#FAFAFA", accentMode: "custom", tint: 0, radius: 8, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "obsidian", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", dockStyle: "floating", recommended: true, description: "Matte black glass with crisp white chrome. The Lens default.", aliases: ["obsidian"] },
  { id: "windows-mesh", label: "Windows Mesh", tier: "Core", base: "#0D1017", accent: "#2D7D9A", accentMode: "windows", tint: 0.16, radius: 8, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "accent", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "taskbar", recommended: true, description: "Follows your Windows accent colour, with a familiar full-width taskbar.", aliases: ["mesh", "windows mesh"] },
  { id: "graphite", label: "Graphite", tier: "Core", base: "#18181C", accent: "#A1A1AA", accentMode: "custom", tint: 0, radius: 10, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "minimal", frameStyle: "none", controlStyle: "minimal-dots", dockStyle: "minimal", description: "Quiet grey, borderless windows and monochrome icons. Nothing shouts.", aliases: ["graphite", "stealth"] },
  { id: "midnight", label: "Midnight", tier: "Core", base: "#050507", accent: "#818CF8", accentMode: "custom", tint: 0, radius: 8, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "slim", description: "True-black surfaces with an indigo glow. Easy on OLED screens.", aliases: ["midnight"] },

  // ---- Linux Suite ----
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", tier: "Linux Suite", base: "#1E1E2E", accent: "#CBA6F7", accentMode: "custom", tint: 0, radius: 12, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "violet", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "floating", recommended: true, description: "Soft pastel mauve on a cosy dark base. Rounded and friendly.", aliases: ["catppuccin", "mocha"] },
  { id: "tokyo-night", label: "Tokyo Night", tier: "Linux Suite", base: "#1A1B26", accent: "#7AA2F7", accentMode: "custom", tint: 0, radius: 10, iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "accent-glow", controlStyle: "traffic-classic", dockStyle: "split", recommended: true, description: "Deep navy with neon-city blue. Apps and folders sit in separate pills.", aliases: ["tokyo night", "tokyonight", "tokyo"] },
  { id: "nord-frost", label: "Nord Frost", tier: "Linux Suite", base: "#2E3440", accent: "#88C0D0", accentMode: "custom", tint: 0, radius: 8, iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "frost", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "slim", description: "Arctic slate grey with icy cyan. Lighter than most dark themes.", aliases: ["nord"] },
  { id: "dracula-glass", label: "Dracula Glass", tier: "Linux Suite", base: "#282A36", accent: "#FF79C6", accentMode: "custom", tint: 0, radius: 10, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "rose", frameStyle: "accent-glow", controlStyle: "accent-pills", dockStyle: "floating", description: "Dracula's grey-violet base with hot-pink highlights and pill buttons.", aliases: ["dracula"] },
  { id: "gruvbox-warm", label: "Gruvbox Warm", tier: "Linux Suite", base: "#282828", accent: "#FE8019", accentMode: "custom", tint: 0, radius: 6, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "ember", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "taskbar", description: "Retro warm grey with orange. Squarer corners, taskbar layout.", aliases: ["gruvbox"] },
  { id: "kanagawa-wave", label: "Kanagawa Wave", tier: "Linux Suite", base: "#1F1F28", accent: "#E46876", accentMode: "custom", tint: 0, radius: 10, iconTheme: "obsidian-squircle", iconShape: "rounded", folderTheme: "ember", frameStyle: "obsidian-hairline", controlStyle: "minimal-dots", dockStyle: "minimal", description: "Ink-wash dark with a muted wave red. Calm, low-contrast chrome.", aliases: ["kanagawa"] },
  { id: "rose-pine", label: "Rosé Pine", tier: "Linux Suite", base: "#191724", accent: "#EBBCBA", accentMode: "custom", tint: 0, radius: 14, iconTheme: "frosted-glass", iconShape: "circle", folderTheme: "rose", frameStyle: "accent-glow", controlStyle: "traffic-muted", dockStyle: "floating", description: "Dusky purple with rose-gold accents and round icons.", aliases: ["rose pine", "rosé pine", "rosepine"] },
  { id: "everforest-dark", label: "Everforest", tier: "Linux Suite", base: "#2D353B", accent: "#A7C080", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "emerald", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "slim", description: "Forest green-grey with moss highlights. Relaxed and natural.", aliases: ["everforest"] },
  { id: "hyprland-neon", label: "Hyprland Neon", tier: "Linux Suite", base: "#0A0C12", accent: "#33CCFF", accentMode: "custom", tint: 0, radius: 14, iconTheme: "accent-duotone", iconShape: "squircle", folderTheme: "neon", frameStyle: "neon", controlStyle: "accent-pills", dockStyle: "split", description: "Tiling-desktop look: glowing cyan borders and split dock pills.", aliases: ["hyprland"] },

  // ---- Studio ----
  { id: "sequoia-frost", label: "Sequoia Frost", tier: "Studio", base: "#1E1E20", accent: "#0A84FF", accentMode: "custom", tint: 0, radius: 14, iconTheme: "native", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", dockStyle: "floating", recommended: true, description: "Polished studio dark with system blue, full-colour icons and big corners.", aliases: ["sequoia", "macos"] },
  { id: "cyberpunk-amber", label: "Cyberpunk Amber", tier: "Studio", base: "#0D0B09", accent: "#FCEE0A", accentMode: "custom", tint: 0, radius: 2, iconTheme: "obsidian-squircle", iconShape: "rounded", folderTheme: "amber", frameStyle: "neon", controlStyle: "accent-pills", dockStyle: "taskbar", description: "Hard edges, electric yellow glow and a sharp taskbar.", aliases: ["cyberpunk"] },
  { id: "solarized-matte", label: "Solarized Matte", tier: "Studio", base: "#002B36", accent: "#2AA198", accentMode: "custom", tint: 0, radius: 8, iconTheme: "monochrome", iconShape: "rounded", folderTheme: "frost", frameStyle: "obsidian-hairline", controlStyle: "traffic-muted", dockStyle: "studio", description: "Classic teal-blue Solarized with a labelled studio dock.", aliases: ["solarized"] },

  // ---- Light ----
  { id: "alabaster-daylight", label: "Alabaster Daylight", tier: "Light", scheme: "light", base: "#EEEEF0", accent: "#2563EB", accentMode: "custom", tint: 0, radius: 10, iconTheme: "native", iconShape: "squircle", folderTheme: "cobalt", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic", dockStyle: "floating", recommended: true, description: "Clean cool-grey daylight with white cards and a clear blue accent.", aliases: ["alabaster", "daylight", "light"] },
  { id: "paper-minimal", label: "Paper Minimal", tier: "Light", scheme: "light", base: "#F5F1E8", accent: "#C2410C", accentMode: "custom", tint: 0, radius: 6, iconTheme: "native", iconShape: "rounded", folderTheme: "ember", frameStyle: "none", controlStyle: "minimal-dots", dockStyle: "slim", description: "Warm paper white with terracotta ink. Borderless and bookish.", aliases: ["paper"] },
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

/** The six packs shown first in Control Center and the Setup Wizard, in display order. */
export function recommendedPacks(): ThemePack[] {
  return THEME_PACKS.filter((p) => p.recommended);
}

export interface ApplyPackOptions {
  /** Also switch `config.dock.style` to the pack's own dock style. Off unless the user ticks
   *  "Also change Dock style": a theme never rearranges someone's Dock behind their back. */
  applyDockStyle?: boolean;
}

/** Returns a new config with every part of the pack applied together (surface, accent, icons, folders, window frame). */
export function applyThemePack(config: LensConfig, packId: string, options: ApplyPackOptions = {}): LensConfig {
  const pack = packById(packId);
  if (!pack) return config;
  const dockStyle = options.applyDockStyle && pack.dockStyle ? { style: pack.dockStyle } : {};
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
      ...dockStyle,
      pinnedFolders: config.dock.pinnedFolders.map((f) => ({ ...f, theme: pack.folderTheme })),
    },
  };
}
