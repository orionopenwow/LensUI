// Parity mock for Backdrop Lab: the base harness mock, plus the wallpaper and studio commands
// kept in memory so "Set as live wallpaper" can be exercised end to end in the browser.
import { invoke as baseInvoke } from "../mock/core";
import { emitLocal } from "../mock/event";
export { convertFileSrc, isTauri } from "../mock/core";

const q = new URLSearchParams(location.search);
let wallpaper: any = {
  enabled: !!q.get("wp"),
  file: "",
  fit: "cover",
  blur: 0,
  dim: 0,
  saturation: 100,
  pauseWhenCovered: true,
  pauseOnBattery: true,
  accentHex: "",
  followAccent: false,
  scene: q.get("wp") ? "backdrop" : "",
  sceneOptions: q.get("wp") ? { backdrop: { preset: q.get("wp") } } : {},
  fps: 30,
  calm: false,
  interactive: false,
  ripples: false,
  workspaceScenes: {},
  idleEnabled: false,
  idleMinutes: 10,
  idleScene: "",
};
export const saved: { name: string; ext: string; bytes: number }[] = [];
(globalThis as any).__studioSaved = saved;
(globalThis as any).__setWallpaper = (w: any) => {
  wallpaper = { ...wallpaper, ...w };
  emitLocal("lens://wallpaper-changed", null);
};

const handlers: Record<string, (a: any) => any> = {
  get_wallpaper_state_cmd: () => ({ settings: wallpaper, path: null, kind: null, attached: wallpaper.enabled, folder: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\wallpapers" }),
  set_wallpaper_settings_cmd: (a) => {
    wallpaper = a.settings;
    setTimeout(() => emitLocal("lens://wallpaper-changed", null), 0);
    return handlers.get_wallpaper_state_cmd({});
  },
  studio_save_export: (a) => {
    saved.push({ name: a.name, ext: a.ext, bytes: String(a.data).length });
    return `C:\\Users\\u\\Pictures\\Lens\\Backdrops\\${a.name}.${a.ext}`;
  },
  studio_save_still_wallpaper: (a) => `Backdrop - ${a.name}.png`,
  save_theme_file_cmd: (a) => `C:\\Users\\u\\AppData\\Roaming\\LensUI\\themes\\${a.name}.lenstheme`,
  get_telemetry_cmd: () => ({ cpuUsage: 12, memUsedGb: 9, memTotalGb: 32, memPercent: 28, uptimeMinutes: 300 }),
  get_dnd_status_cmd: () => ({ active: false, manual: false, scheduled: false, fullscreen: false, reason: "" }),
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  const h = handlers[cmd];
  if (h) return h(args ?? {}) as T;
  return baseInvoke<T>(cmd, args);
}
