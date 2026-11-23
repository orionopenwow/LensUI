import type { WallpaperSettings } from "../../surfaces/wallpaperTypes";
import type { Motion } from "./core";
import { AMBIENT_SCENE_ID } from "./module";

/* The backdrop lives in the wallpaper settings as the Playground scene "ambient" (pure helpers). */

export interface AmbientOptions {
  variant: string;
  motion: Motion;
  /** What the wallpaper showed before the backdrop was turned on (restored when turned off). */
  prevScene?: string;
  prevEnabled?: boolean;
}

export function ambientOptionsOf(s: WallpaperSettings | undefined | null): AmbientOptions {
  const raw = (s?.sceneOptions?.[AMBIENT_SCENE_ID] ?? {}) as Record<string, unknown>;
  const motion = raw.motion === "still" || raw.motion === "lively" ? raw.motion : "subtle";
  return {
    variant: typeof raw.variant === "string" ? raw.variant : "auto",
    motion,
    prevScene: typeof raw.prevScene === "string" ? raw.prevScene : undefined,
    prevEnabled: typeof raw.prevEnabled === "boolean" ? raw.prevEnabled : undefined,
  };
}

export function isAmbientOn(s: WallpaperSettings | undefined | null): boolean {
  return !!s?.enabled && s.scene === AMBIENT_SCENE_ID;
}

/** Pure: the wallpaper settings with the backdrop turned on or off (reversible). */
export function withAmbient(s: WallpaperSettings, on: boolean, patch: Partial<AmbientOptions> = {}): WallpaperSettings {
  const cur = ambientOptionsOf(s);
  const opts: AmbientOptions = { ...cur, ...patch };
  if (on && !isAmbientOn(s)) {
    opts.prevScene = s.scene === AMBIENT_SCENE_ID ? "" : s.scene;
    opts.prevEnabled = s.enabled;
  }
  const sceneOptions = { ...(s.sceneOptions ?? {}), [AMBIENT_SCENE_ID]: { ...opts } as Record<string, string | boolean> };
  if (on) return { ...s, enabled: true, scene: AMBIENT_SCENE_ID, interactive: false, sceneOptions };
  if (!isAmbientOn(s)) return { ...s, sceneOptions };
  return { ...s, scene: opts.prevScene ?? "", enabled: opts.prevEnabled ?? false, sceneOptions };
}

