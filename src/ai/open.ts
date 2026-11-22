import { invoke } from "@tauri-apps/api/core";

/** Opens a web link in the default browser via the same path the search "web" results use. */
export function openExternal(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  invoke("launch_app_cmd", { path: url }).catch(() => {});
}
