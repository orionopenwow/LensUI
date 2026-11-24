/**
 * "Make a theme from this": a picture's five colours become a readable theme pack the same way a
 * Backdrop Lab look does (engine/theme.ts backdropToPack: contrast-checked base and accent), saved
 * as a `.lenstheme` and applied. The picture stays the wallpaper.
 */
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../types/lens";
import { applyThemePack } from "../themes/packs";
import { exportLensThemeAsCustomPack } from "../themes/lenstheme";
import { backdropToPack, defaultState, evenStops, normaliseState, type BackdropState } from "../studio/backdrop/engine";
import { byLightness } from "./model";

/** The gradient a palette stands for: its colours, dark to light. */
export function stateFromPalette(palette: string[], name: string): BackdropState {
  const base = defaultState("mesh");
  return normaliseState({ ...base, name, stops: evenStops(byLightness(palette)) });
}

export interface PaletteTheme {
  packId: string;
  label: string;
  report: { text: number; accent: number; ok: boolean };
  prevConfig: LensConfig;
}

export async function themeFromPalette(palette: string[], name: string, config: LensConfig, updateConfig: (c: LensConfig) => void): Promise<PaletteTheme> {
  const { pack, report } = backdropToPack(stateFromPalette(palette, name), name);
  const label = pack.label;
  const file = exportLensThemeAsCustomPack(config, label, { ...pack, id: label });
  const packId = file.theme.preset;
  await invoke("save_theme_file_cmd", { name: label, json: JSON.stringify(file, null, 2) });
  updateConfig(applyThemePack(config, packId));
  return { packId, label, report, prevConfig: config };
}
