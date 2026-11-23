/** Wallpaper Switcher: the calls into Rust (src-tauri/src/commands/wallpapers.rs). */
import { invoke } from "@tauri-apps/api/core";
import type { ItemMeta, LibraryView, Original, Switched, SwitcherSettings } from "../types/generated";
import type { WallpaperSettings, WallpaperState } from "../surfaces/wallpaperTypes";

export const hourNow = () => new Date().getHours();

export const wallpapersApi = {
  library: () => invoke<LibraryView>("wallpapers_library_cmd"),
  saveSettings: (settings: SwitcherSettings) => invoke<LibraryView>("wallpapers_save_settings_cmd", { settings }),
  setMeta: (id: string, meta: ItemMeta) => invoke<null>("wallpapers_set_meta_cmd", { id, meta }),
  read: (id: string) => invoke<Original>("wallpapers_read_cmd", { id }),
  saveThumb: (id: string, dataB64: string, meta: ItemMeta) => invoke<string>("wallpapers_save_thumb_cmd", { id, dataB64, meta }),
  set: (id: string) => invoke<Switched>("wallpapers_set_cmd", { id }),
  step: (direction: "next" | "prev" | "random") => invoke<Switched>("wallpapers_step_cmd", { direction, hour: hourNow() }),
  tick: (paused: boolean, started: boolean) => invoke<Switched | null>("wallpapers_tick_cmd", { paused, started, hour: hourNow() }),
  /** Only ever called after the picker's own "Move to Recycle Bin" confirmation. */
  recycle: (id: string) => invoke<null>("wallpapers_recycle_cmd", { id, confirmed: true }),
  reveal: (id: string) => invoke<null>("wallpapers_reveal_cmd", { id }),
  host: async (): Promise<WallpaperSettings> => (await invoke<WallpaperState>("get_wallpaper_state_cmd")).settings,
  setHost: (settings: WallpaperSettings) => invoke<WallpaperState>("set_wallpaper_settings_cmd", { settings }),
};
