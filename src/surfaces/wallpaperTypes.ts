/** Mirrors win_wallpaper.rs (serde camelCase). */
export interface WallpaperSettings {
  enabled: boolean;
  file: string;
  fit: "cover" | "contain" | "fill" | "center" | string;
  blur: number;
  dim: number;
  saturation: number;
  pauseWhenCovered: boolean;
  pauseOnBattery: boolean;
  accentHex: string;
  followAccent: boolean;
  /** Playground scene id ("" = show `file`). See src/playground/ and docs/PLAYGROUND.md. */
  scene: string;
  /** Per-scene settings: { [sceneId]: { key: value } }. */
  sceneOptions: Record<string, Record<string, number | string | boolean>>;
  fps: number;
  /** Freeze the scene into a still frame and stop the desktop input hook. */
  calm: boolean;
  /** Set by the card: some chosen scene reacts to the cursor (starts the input hook). */
  interactive: boolean;
  /** Ripples where you click empty desktop (wallpaper only). */
  ripples: boolean;
  /** Scene per Lens workspace id, used while Lens workspaces are on. */
  workspaceScenes: Record<string, string>;
  idleEnabled: boolean;
  idleMinutes: number;
  /** "" = the wallpaper scene, or Aurora. */
  idleScene: string;
}

export type WallpaperKind = "image" | "video" | "html";

export interface WallpaperState {
  settings: WallpaperSettings;
  path: string | null;
  kind: WallpaperKind | null;
  attached: boolean;
  folder: string;
}

export interface WallpaperFile {
  name: string;
  path: string;
  kind: WallpaperKind;
  bytes: number;
}

export const FIT_TO_OBJECT_FIT: Record<string, string> = {
  cover: "cover",
  contain: "contain",
  fill: "fill",
  center: "none",
};
