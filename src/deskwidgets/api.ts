// Calls into Lens for desktop widgets (src-tauri/src/commands/desktop_widgets.rs). Every command
// refuses while magicWaves.desktopWidgets is off. Widget data comes from Lens's own local readers
// (battery, media, Shelf, the Lens calendar); the only network path is a Dashboard gallery widget
// the person already approved, fetched by Lens under the Dashboard's rules.
import { invoke } from "@tauri-apps/api/core";
import type { DeskItem, DeskState, HostStatus } from "../types/generated";

export const EVT_EDIT = "lens://deskwidgets-edit";
export const EVT_STATE = "lens://deskwidgets-state";
/** The widget flyout goes out or back in: `{ out, origin: [x, y] | null, key, mode? }`. */
export const EVT_FLYOUT = "lens://deskwidgets-flyout";

export interface FlyoutEvent {
  out: boolean;
  /** CSS px inside the host window where the widgets fly from (null: the top-left default). */
  origin: [number, number] | null;
  /** Monitor key of the layout the flyout shows. */
  key: string;
  /** Sent when the flyout setting itself changed. */
  mode?: boolean;
}

export const deskApi = {
  available: () => invoke<boolean>("desktop_widgets_available").catch(() => false),
  state: () => invoke<DeskState>("desktop_widgets_state"),
  save: (key: string, items: DeskItem[]) => invoke<DeskItem[]>("desktop_widgets_save", { key, items }),
  /** Widget rects in CSS px inside the window; `hold` keeps the pointer during a drag or a menu. */
  hits: (rects: [number, number, number, number][], hold?: boolean) => invoke("desktop_widgets_hits", { rects, hold: hold ?? null }).catch(() => {}),
  edit: (on?: boolean) => invoke<boolean>("desktop_widgets_edit", { on: on ?? null }),
  status: () => invoke<HostStatus>("desktop_widgets_status"),
  /** The widget flyout out (true), back in (false) or toggled (absent). */
  flyout: (on?: boolean) => invoke<boolean>("desktop_widgets_flyout", { on: on ?? null }),
};

/** The widget flyout is turned on (Rust has the last word on the setting). */
export const widgetFlyoutOn = () =>
  invoke<DeskState>("desktop_widgets_state")
    .then((s) => !!s.flyout)
    .catch(() => false);

/** Flies the widgets out or puts them away from anywhere (Command, Settings). Null when done. */
export async function toggleWidgetFlyout(on?: boolean): Promise<string | null> {
  try {
    await invoke("desktop_widgets_flyout", { on: on ?? null });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "The widgets couldn't fly out.";
  }
}

/** The exact phrases Command takes as "show / hide my widgets" (the flyout): true out, false
 *  away, undefined toggle, null when the text is something else. */
export function flyoutPhrase(text: string): boolean | undefined | null {
  const t = text.trim().toLowerCase().replace(/[.!?…]+$/, "").replace(/\s+/g, " ");
  const m = /^(?:(show|open|hide|close|toggle) )?(?:the |my )?(?:desktop )?widgets$/.exec(t);
  if (!m) return null;
  return m[1] === "show" || m[1] === "open" ? true : m[1] === "hide" || m[1] === "close" ? false : undefined;
}

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
