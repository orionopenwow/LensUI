/**
 * Which tool Lens Studio opens on. The picker shares the Studio window with Backdrop Lab; a
 * caller in another window leaves a note here (and sends an event for a Studio that is already
 * open), then asks for the window.
 */
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export type StudioView = "backdrop" | "wallpapers";

const KEY = "lens.studio.view";
export const STUDIO_VIEW_EVENT = "lens://studio-view";

export function setPendingStudioView(view: StudioView): void {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* private mode: the event below still reaches an open Studio */
  }
  emit(STUDIO_VIEW_EVENT, view).catch(() => {});
}

export function takePendingStudioView(): StudioView | null {
  try {
    const v = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return v === "wallpapers" || v === "backdrop" ? v : null;
  } catch {
    return null;
  }
}

export function openWallpaperPicker(): void {
  setPendingStudioView("wallpapers");
  invoke("open_surface", { label: "studio" }).catch(() => invoke("toggle_surface", { label: "studio" }).catch(() => {}));
}
