// "Teach me": after Command has done something, say where that setting lives so the person can
// find it themselves next time ("Settings › Dock & Bar › Dock style", with a link). Command
// becomes the fastest way to learn Lens's settings. Pure; the names come from the Settings
// registry, so a renamed page or section can't leave a stale label here (teach.test.ts).
import { getPage, resolveTarget } from "../settings/registry";

/** Offline intent action (src-tauri/src/ai/intent.rs ACTIONS) → its home in Settings
 *  (`page#section`). Actions that change no setting (open an app, a calculation, lock the
 *  screen) are left out on purpose: there is nothing to learn a place for. */
export const SETTING_HOMES: Record<string, string> = {
  set_color_mode: "appearance#current",
  set_theme_pack: "appearance#choose",
  set_accent: "appearance#current",
  set_dock_style: "dock#style",
  next_wallpaper: "desktop#living",
  set_wallpaper_scene: "desktop#living",
  set_calm_mode: "desktop#living",
  make_backdrop: "appearance#creator",
  set_focus_mode: "focus",
  set_dnd: "focus",
  set_volume: "sound#mixer",
  change_volume: "sound#mixer",
  set_mute: "sound#mixer",
  set_brightness: "display",
  change_brightness: "display",
  set_night_light: "display",
  switch_workspace: "keys#desktops",
  snap_window: "keys#input",
  arrange_windows: "keys#input",
};

export interface SettingHome {
  /** Deep link for `openSettingsAt` (`page#section`). */
  target: string;
  /** "Settings › Dock & Bar › Dock style". */
  path: string;
}

/** Where the setting an action changed lives, or null when the action changes no setting. */
export function whereItLives(action: string | null | undefined): SettingHome | null {
  const target = action ? SETTING_HOMES[action] : undefined;
  if (!target) return null;
  const hit = resolveTarget(target);
  if (!hit) return null;
  const page = getPage(hit.page);
  const section = hit.section ? page.sections.find((s) => s.id === hit.section) : undefined;
  return { target, path: ["Settings", page.label, section?.label].filter(Boolean).join(" › ") };
}
