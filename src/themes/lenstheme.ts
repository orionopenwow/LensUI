import type { LensConfig } from "../types/lens";
import { applyThemePack, customPackDefinition, packById, registerCustomPack } from "./packs";

/**
 * `.lenstheme` — a small, shareable JSON snapshot of how Lens looks.
 * Files live in %APPDATA%\LensUI\themes (see win_themes.rs). Importing never trusts the file:
 * every field is type-checked and clamped to the same safe ranges the Control Center enforces
 * (opacity 40–100%, roundness 0–20px). Custom CSS is deliberately not part of the format.
 */
export interface LensThemeFile {
  lenstheme: 1;
  name: string;
  theme: {
    preset: string;
    accentMode: string;
    customAccent: string;
    glassOpacity: number;
    blurPx: number;
    borderRadius: number;
    accentTintStrength: number;
    fontFamily?: string;
    uiScale?: number;
  };
  iconStyle?: { theme: string; shape: string };
  windowControls?: {
    style: string;
    order: string;
    position: string;
    frameStyle?: string;
    frameBorderEnabled?: boolean;
  };
  folderTheme?: string;
  /**
   * Optional custom pack (its own surface color, accent, radius, light/dark scheme).
   * Validated by validateCustomPack and registered under a "custom-…" id on import.
   */
  pack?: Record<string, unknown>;
  /** Optional Backdrop Lab code ("LBG1.…"): the living wallpaper made with this theme (docs/BACKDROP_LAB.md). */
  backdrop?: string;
}

export function exportLensTheme(config: LensConfig, name: string): LensThemeFile {
  const t = config.theme;
  return {
    lenstheme: 1,
    name,
    theme: {
      preset: t.preset,
      accentMode: t.accentMode,
      customAccent: t.customAccent,
      glassOpacity: t.glassOpacity,
      blurPx: t.blurPx,
      borderRadius: t.borderRadius,
      accentTintStrength: t.accentTintStrength,
      fontFamily: t.fontFamily,
      uiScale: t.uiScale,
    },
    iconStyle: config.iconStyle,
    windowControls: {
      style: config.windowControls.style,
      order: config.windowControls.order,
      position: config.windowControls.position,
      frameStyle: config.windowControls.frameStyle,
      frameBorderEnabled: config.windowControls.frameBorderEnabled,
    },
    folderTheme: config.folderStyle?.theme,
    // If the active look is a custom pack, carry its definition so the file works anywhere.
    ...(packById(t.preset)?.tier === "Custom"
      ? { pack: customPackDefinition(packById(t.preset)!) }
      : {}),
  };
}

/**
 * Exports the current look as a NEW custom pack with its own surface color.
 * `packDef` needs at least { label, base }; accent and radius default to the current ones.
 * Throws if the definition is invalid (bad hex, unreadable light/dark combination).
 */
export function exportLensThemeAsCustomPack(
  config: LensConfig,
  name: string,
  packDef: Record<string, unknown>
): LensThemeFile {
  const accent =
    config.theme.accentMode === "custom" ? config.theme.customAccent : "#FAFAFA";
  const pack = registerCustomPack({
    id: name,
    label: name,
    accent,
    radius: config.theme.borderRadius,
    iconTheme: config.iconStyle?.theme,
    iconShape: config.iconStyle?.shape,
    folderTheme: config.folderStyle?.theme,
    frameStyle: config.windowControls.frameStyle,
    controlStyle: config.windowControls.style,
    ...packDef,
  });
  if (!pack) throw new Error("That surface color can't be used for a theme.");
  const file = exportLensTheme(config, name);
  return {
    ...file,
    theme: { ...file.theme, preset: pack.id, accentMode: "custom", customAccent: pack.accent },
    pack: customPackDefinition(pack),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A short identifier-like string (preset ids, style ids), or the fallback. */
function ident(v: unknown, fallback: string): string {
  return typeof v === "string" && /^[\w -]{1,40}$/.test(v) ? v : fallback;
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function hex(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
}

/** Returns a new config with the theme file applied. Throws if the file is not a .lenstheme. */
export function importLensTheme(config: LensConfig, raw: unknown): LensConfig {
  if (!isObj(raw) || raw.lenstheme !== 1 || !isObj(raw.theme)) {
    throw new Error("Not a Lens theme file.");
  }
  const t = raw.theme;
  // A custom pack travels with the file. Register it first so its "custom-…" id resolves,
  // and start from the pack's own defaults; the explicit fields below then override them.
  const customPack = raw.pack !== undefined ? registerCustomPack(raw.pack) : null;
  if (raw.pack !== undefined && !customPack) {
    throw new Error("This theme file's custom pack is invalid.");
  }
  if (customPack) {
    config = applyThemePack(config, customPack.id);
    t.preset = customPack.id;
  }
  const cur = config.theme;
  const next: LensConfig = {
    ...config,
    theme: {
      ...cur,
      preset: ident(t.preset, cur.preset),
      accentMode: t.accentMode === "windows" ? "windows" : "custom",
      customAccent: hex(t.customAccent, cur.customAccent),
      glassOpacity: num(t.glassOpacity, 0.4, 1, cur.glassOpacity),
      blurPx: Math.round(num(t.blurPx, 0, 60, cur.blurPx)),
      borderRadius: Math.round(num(t.borderRadius, 0, 20, cur.borderRadius)),
      accentTintStrength: num(t.accentTintStrength, 0, 0.5, cur.accentTintStrength),
      fontFamily: ident(t.fontFamily, cur.fontFamily ?? "rounded-arial"),
      uiScale: Math.round(num(t.uiScale, 80, 130, cur.uiScale ?? 100)),
    },
  };
  if (isObj(raw.iconStyle)) {
    next.iconStyle = {
      theme: ident(raw.iconStyle.theme, config.iconStyle?.theme ?? "obsidian-squircle"),
      shape: ident(raw.iconStyle.shape, config.iconStyle?.shape ?? "squircle"),
    };
  }
  if (isObj(raw.windowControls)) {
    const w = raw.windowControls;
    const cw = config.windowControls;
    next.windowControls = {
      ...cw,
      style: ident(w.style, cw.style),
      order: ident(w.order, cw.order),
      position: ident(w.position, cw.position),
      frameStyle: ident(w.frameStyle, cw.frameStyle ?? "obsidian-hairline"),
      frameBorderEnabled:
        typeof w.frameBorderEnabled === "boolean" ? w.frameBorderEnabled : cw.frameBorderEnabled,
    };
  }
  if (typeof raw.folderTheme === "string") {
    const folderTheme = ident(raw.folderTheme, config.folderStyle?.theme ?? "accent");
    next.folderStyle = {
      ...(config.folderStyle ?? { theme: "accent", globalExplorerOverride: false }),
      theme: folderTheme,
    };
    next.dock = {
      ...config.dock,
      pinnedFolders: config.dock.pinnedFolders.map((f) => ({ ...f, theme: folderTheme })),
    };
  }
  return next;
}
