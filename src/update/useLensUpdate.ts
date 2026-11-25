// One hook for every window that shows Lens update state: the Top Bar pill, Settings' Updates
// card and Command's `/update`. The backend broadcasts `lens://update-state`.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { IDLE, applyStatus, type UpdateStatus } from "./model";

export const UPDATE_EVENT = "lens://update-state";

export function useLensUpdate() {
  const [status, setStatus] = useState<UpdateStatus>(IDLE);
  const take = useCallback((next: UpdateStatus | null | undefined) => {
    if (next) setStatus((prev) => applyStatus(prev, next));
  }, []);

  useEffect(() => {
    let alive = true;
    invoke<UpdateStatus>("get_update_state_cmd")
      .then((s) => alive && take(s))
      .catch(() => {});
    const un = listen<UpdateStatus>(UPDATE_EVENT, (e) => take(e.payload));
    return () => {
      alive = false;
      un.then((f) => f()).catch(() => {});
    };
  }, [take]);

  const check = useCallback(() => invoke<UpdateStatus>("check_for_update_cmd").then(take), [take]);
  const download = useCallback(() => invoke<UpdateStatus>("download_update_cmd").then(take), [take]);
  /** Installs the verified update and starts Lens again. */
  const restart = useCallback(() => invoke<string>("restart_to_update_cmd"), []);
  return { status, check, download, restart };
}

/** Settings › About & Testing › Updates. */
export function openUpdatesInSettings(): Promise<void> {
  return openSettingsAt("about#updates");
}

/** Opens Settings at `page#section`. Said twice so a Settings page that is still loading gets it. */
export async function openSettingsAt(target: string): Promise<void> {
  await invoke("open_surface", { label: "settings" }).catch(() => {});
  await emit("lens://settings-tab", target).catch(() => {});
  window.setTimeout(() => void emit("lens://settings-tab", target).catch(() => {}), 700);
}
