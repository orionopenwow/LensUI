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
