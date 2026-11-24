/**
 * Lens Command's `/wallpaper`: "/wallpaper next", "/wallpaper previous", "/wallpaper random", or
 * just "/wallpaper" to open the picker. Voice says the same thing ("next wallpaper") through
 * `runWallpaperAction`. A user template that already uses the word `wallpaper` wins.
 */
import { invoke } from "@tauri-apps/api/core";
import { wallpapersApi } from "./api";
import { setPendingStudioView } from "./open";

export type WallpaperAction = "next" | "prev" | "random" | "open";

const STUBS = new WeakSet<object>();

export function wallpaperTemplate(taken: { id: string }[]) {
  if (taken.some((t) => t.id === "wallpaper")) return [];
  const t = {
    id: "wallpaper",
    name: "Wallpaper",
    description: "Change the wallpaper: /wallpaper next, previous or random. On its own it opens the picker.",
    template: "",
    provider: "local",
    input: "none",
    options: ["next", "previous", "random", "open"] as string[],
    output: "action",
    builtin: true,
    enabled: true,
  };
  STUBS.add(t);
  return [t];
}

export const isWallpaperStub = (t: object | null | undefined) => !!t && STUBS.has(t);

export function parseWallpaperSlash(words: string): WallpaperAction {
  const w = words.trim().toLowerCase();
  if (/^(next|forward|skip|change|another|new)\b/.test(w)) return "next";
  if (/^(prev|previous|back|last)\b/.test(w)) return "prev";
  if (/^(random|shuffle|surprise)\b/.test(w)) return "random";
  return "open";
}

/** Runs one action. Resolves to a line worth showing ("Showing Dunes"), or the reason it could not. */
export async function runWallpaperAction(action: WallpaperAction): Promise<string> {
  if (action === "open") {
    setPendingStudioView("wallpapers");
    await invoke("open_surface", { label: "studio" }).catch(() => invoke("toggle_surface", { label: "studio" }).catch(() => {}));
    return "Wallpaper picker opened.";
  }
  try {
    const s = await wallpapersApi.step(action);
    return `Showing ${s.name.replace(/\.[^.]+$/, "")}.`;
  } catch (e) {
    return typeof e === "string" ? e : "The wallpaper could not be changed.";
  }
}

export function runWallpaperSlash(words: string): Promise<string> {
  return runWallpaperAction(parseWallpaperSlash(words));
}
