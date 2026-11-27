// Calls into Lens for desktop widgets (src-tauri/src/commands/desktop_widgets.rs). Every command
// refuses while magicWaves.desktopWidgets is off. Widget data comes from Lens's own local readers
// (battery, media, Shelf, the Lens calendar); the only network path is a Dashboard gallery widget
// the person already approved, fetched by Lens under the Dashboard's rules.
import { invoke } from "@tauri-apps/api/core";
import type { DeskItem, DeskState, HostStatus } from "../types/generated";

export const EVT_EDIT = "lens://deskwidgets-edit";
export const EVT_STATE = "lens://deskwidgets-state";

export const deskApi = {
  available: () => invoke<boolean>("desktop_widgets_available").catch(() => false),
  state: () => invoke<DeskState>("desktop_widgets_state"),
  save: (key: string, items: DeskItem[]) => invoke<DeskItem[]>("desktop_widgets_save", { key, items }),
  /** Widget rects in CSS px inside the window; `hold` keeps the pointer during a drag or a menu. */
  hits: (rects: [number, number, number, number][], hold?: boolean) => invoke("desktop_widgets_hits", { rects, hold: hold ?? null }).catch(() => {}),
  edit: (on?: boolean) => invoke<boolean>("desktop_widgets_edit", { on: on ?? null }),
  status: () => invoke<HostStatus>("desktop_widgets_status"),
};

export type DeskApi = typeof deskApi;

/** Opens edit mode from anywhere (Settings, the Dashboard, Command, Magic). */
export async function editDesktopWidgets(): Promise<string | null> {
  try {
    await invoke("desktop_widgets_edit", { on: true });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "Desktop widgets couldn't open for editing.";
  }
}

/** The exact phrases Command takes as "edit my desktop widgets". */
export function isEditWidgetsPhrase(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?…]+$/, "").replace(/\s+/g, " ");
  return /^(?:\/widgets|(?:edit|arrange|change|customi[sz]e) (?:the |my )?(?:desktop )?widgets|add (?:a )?desktop widgets?)$/.test(t);
}
