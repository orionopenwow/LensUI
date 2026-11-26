// Calls into Lens for Dashboard widgets (src-tauri/src/commands/widgets.rs). Lens decides every
// fetch: only approved https hosts, never this PC or the local network, nothing while the kill
// switch is on.
import { invoke } from "@tauri-apps/api/core";

export interface WidgetInstance {
  id: string;
  galleryId: string;
  title: string;
  params: Record<string, string>;
  hosts: string[];
  addedMs: number;
}

export interface WidgetStore {
  fetchOff: boolean;
  widgets: WidgetInstance[];
}

export interface Fetched {
  body: string;
  contentType: string;
  fetchedMs: number;
  fromCache: boolean;
}

export const WIDGETS_CHANGED = "lens://widgets-changed";
export const EMPTY_STORE: WidgetStore = { fetchOff: false, widgets: [] };

export const widgetsApi = {
  state: () => invoke<WidgetStore>("widgets_state").catch(() => EMPTY_STORE),
  add: (galleryId: string, title: string, params: Record<string, string>, hosts: string[]) =>
    invoke<WidgetStore>("widgets_add", { galleryId, title, params, hosts }),
  remove: (id: string) => invoke<WidgetStore>("widgets_remove", { id }),
  move: (id: string, delta: number) => invoke<WidgetStore>("widgets_move", { id, delta }),
  setParams: (id: string, params: Record<string, string>) => invoke<WidgetStore>("widgets_set_params", { id, params }),
  revokeHost: (id: string, host: string) => invoke<WidgetStore>("widgets_revoke_host", { id, host }),
  setFetchOff: (off: boolean) => invoke<WidgetStore>("widgets_set_fetch_off", { off }),
  fetch: (id: string, url: string, maxAgeMinutes: number) => invoke<Fetched>("widgets_fetch", { id, url, maxAgeMinutes }),
  telemetry: () => invoke<{ cpuUsage: number; memPercent: number; memUsedGb: number; memTotalGb: number; uptimeMinutes: number }>("get_telemetry_cmd").catch(() => null),
  openUrl: (url: string) => invoke("browser_open", { url }).catch(() => {}),
};

export type WidgetsApi = typeof widgetsApi;
