// Scroll on a Dock icon → that app's volume (src/dock/volume.ts has the rules). One handler for the
// whole Dock, one readout at a time, one timer (the readout's), nothing while idle.
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AudioAppSession } from "../../types/generated";
import type { RunningWindow } from "../../types/lens";
import { dockFail } from "../act";
import { VOLUME_READOUT_MS, VOLUME_SESSIONS_TTL_MS, currentLevel, nextVolume, sessionsForApp, volumeStepDir } from "../volume";

export interface VolumeReadout {
  key: string;
  /** null: the app isn't playing any sound Windows knows of. */
  level: number | null;
}

export function useWheelVolume(appName: (key: string) => string) {
  const [readout, setReadout] = useState<VolumeReadout | null>(null);
  const state = useRef({ lastAt: 0, busy: false, hide: 0, sessions: [] as AudioAppSession[], sessionsAt: -Infinity, levels: new Map<string, number>() });
  useEffect(() => () => window.clearTimeout(state.current.hide), []);

  const show = (r: VolumeReadout) => {
    setReadout(r);
    window.clearTimeout(state.current.hide);
    state.current.hide = window.setTimeout(() => setReadout(null), VOLUME_READOUT_MS);
  };

  const sessions = async (): Promise<AudioAppSession[]> => {
    const s = state.current;
    const now = performance.now();
    if (now - s.sessionsAt < VOLUME_SESSIONS_TTL_MS) return s.sessions;
    const list = await invoke<AudioAppSession[]>("list_audio_sessions_cmd").catch((e) => {
      dockFail("read the app's volume")(e);
      return [] as AudioAppSession[];
    });
    s.sessions = Array.isArray(list) ? list : [];
    s.sessionsAt = performance.now();
    // Levels read from Windows win over the ones remembered from the last scroll.
    s.levels.clear();
    return s.sessions;
  };

  /** A wheel turn over an app's icon that the Dock decided is for the volume. */
  const onWheel = (key: string, wins: RunningWindow[], appPath: string | undefined, e: React.WheelEvent) => {
    const s = state.current;
    const dir = volumeStepDir(e.deltaX, e.deltaY, s.lastAt, e.timeStamp);
    if (!dir || s.busy) return;
    s.lastAt = e.timeStamp;
    s.busy = true;
    void sessions()
      .then((all) => {
        const mine = sessionsForApp(all, wins, appPath);
        const from = s.levels.get(key) ?? currentLevel(mine);
        if (from === null) {
          show({ key, level: null });
          return;
        }
        const level = nextVolume(from, dir);
        s.levels.set(key, level);
        s.sessionsAt = performance.now(); // still scrolling: keep the remembered level
        show({ key, level });
        if (level === from) return;
        for (const m of mine) {
          invoke("set_app_volume_cmd", { pid: m.pid, level }).catch(dockFail(`change ${appName(key)}'s volume`));
        }
      })
      .finally(() => {
        s.busy = false;
      });
  };

  return { readout, onWheel };
}
