/**
 * What the Lab does to the rest of Lens: live / still wallpaper, try-for-10-seconds, and
 * "Make a theme from this". Every change returns what it replaced, so the toast can Undo it.
 * The Windows wallpaper itself is never changed (the Lens wallpaper draws over it and goes away
 * when Lens closes or the wallpaper is turned off).
 */
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../../types/lens";
import type { WallpaperSettings, WallpaperState } from "../../surfaces/wallpaperTypes";
import { applyThemePack } from "../../themes/packs";
import { exportLensThemeAsCustomPack } from "../../themes/lenstheme";
import { BACKDROP_SCENE_ID } from "./scene";
import { backdropToPack, decodeState, encodeState, type BackdropState, type Keyframes } from "./engine";
import { renderPng } from "./exporter";

async function current(): Promise<WallpaperSettings> {
  const st = await invoke<WallpaperState>("get_wallpaper_state_cmd");
  return st.settings;
}

async function save(next: WallpaperSettings): Promise<void> {
  await invoke("set_wallpaper_settings_cmd", { settings: next });
}

export function liveSettings(prev: WallpaperSettings, s: BackdropState, extra: Record<string, string | number | boolean> = {}): WallpaperSettings {
  const old = (prev.sceneOptions?.[BACKDROP_SCENE_ID] ?? {}) as Record<string, string | number | boolean>;
  return {
    ...prev,
    enabled: true,
    scene: BACKDROP_SCENE_ID,
    calm: false,
    sceneOptions: { ...(prev.sceneOptions ?? {}), [BACKDROP_SCENE_ID]: { ...old, preset: "custom", code: encodeState(s), ...extra } },
  };
}

/** Plays `s` as the live wallpaper. Resolves to the settings it replaced (for Undo). */
export async function setLiveWallpaper(s: BackdropState, extra: Record<string, string | number | boolean> = {}): Promise<WallpaperSettings> {
  const prev = await current();
  await save(liveSettings(prev, s, extra));
  return prev;
}

export async function restoreWallpaper(prev: WallpaperSettings): Promise<void> {
  await save(prev);
}

/** Shows `s` on the desktop for `ms`, then puts the old wallpaper back unless `keep()` was called. */
export function tryOnDesktop(s: BackdropState, ms = 10_000): { keep: () => void; cancel: () => Promise<void>; done: Promise<"kept" | "reverted"> } {
  let prev: WallpaperSettings | null = null;
  let kept = false;
  let timer = 0;
  let finish: (v: "kept" | "reverted") => void = () => {};
  const done = new Promise<"kept" | "reverted">((r) => (finish = r));
  const revert = async () => {
    window.clearTimeout(timer);
    if (prev && !kept) await restoreWallpaper(prev).catch(() => {});
    finish(kept ? "kept" : "reverted");
  };
  setLiveWallpaper(s)
    .then((p) => {
      prev = p;
      timer = window.setTimeout(revert, ms);
    })
    .catch(() => finish("reverted"));
  return {
    keep: () => {
      kept = true;
      window.clearTimeout(timer);
      finish("kept");
    },
    cancel: revert,
    done,
  };
}

/** Saves a still PNG into the Lens wallpapers folder and shows it. */
export async function setStillWallpaper(s: BackdropState, w = screen.width * (devicePixelRatio || 1), h = screen.height * (devicePixelRatio || 1)): Promise<WallpaperSettings> {
  const png = renderPng(s, Math.round(Math.min(3840, w)), Math.round(Math.min(2160, h)));
  const file = await invoke<string>("studio_save_still_wallpaper", { name: s.name || "Backdrop", data: png });
  const prev = await current();
  await save({ ...prev, enabled: true, scene: "", file });
  return prev;
}

/** Time-of-day looks for the live wallpaper (codes keyed by part of day). */
export async function setKeyframes(keys: Keyframes): Promise<void> {
  const prev = await current();
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(keys)) if (v) map[k] = encodeState(v);
  const base = keys.noon ?? keys.morning ?? keys.evening ?? keys.night;
  if (!base) return;
  await save(liveSettings(prev, base, { keys: JSON.stringify(map) }));
}

export interface ThemeResult {
  packId: string;
  report: { text: number; accent: number; ok: boolean };
  prevConfig: LensConfig;
  prevWallpaper: WallpaperSettings | null;
}

/**
 * Builds a readable custom pack from the backdrop, saves it as a `.lenstheme` that carries the
 * backdrop code, applies it, and sets the backdrop as its live wallpaper.
 */
export async function makeTheme(s: BackdropState, name: string, config: LensConfig, updateConfig: (c: LensConfig) => void): Promise<ThemeResult> {
  const { pack, report } = backdropToPack(s, name);
  const label = pack.label;
  const file = exportLensThemeAsCustomPack(config, label, { ...pack, id: label });
  const packId = file.theme.preset;
  const withBackdrop = { ...file, backdrop: encodeState({ ...s, name: label }) };
  await invoke("save_theme_file_cmd", { name: label, json: JSON.stringify(withBackdrop, null, 2) });
  const prevConfig = config;
  updateConfig(applyThemePack(config, packId));
  let prevWallpaper: WallpaperSettings | null = null;
  try {
    prevWallpaper = await setLiveWallpaper(s);
  } catch {
    prevWallpaper = null;
  }
  return { packId, report, prevConfig, prevWallpaper };
}

/**
 * A `.lenstheme` made by "Make a theme from this" carries its backdrop as a code. When such a file is
 * applied, play that backdrop as the live wallpaper too. Files without one (or with an invalid code)
 * leave the wallpaper alone. Resolves to true when the wallpaper changed.
 */
export async function applyThemeFileBackdrop(raw: unknown): Promise<boolean> {
  const code = raw && typeof raw === "object" ? (raw as { backdrop?: unknown }).backdrop : undefined;
  if (typeof code !== "string" || code.length > 32_000) return false;
  const s = decodeState(code);
  if (!s) return false;
  await setLiveWallpaper(s);
  return true;
}
