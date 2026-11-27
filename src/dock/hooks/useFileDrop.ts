// Drop files on a Dock app to open them with it (and on the sparkle, for Lens). Tauri delivers OS
// file drags as window events with physical-pixel positions; the app under the pointer is hit-tested.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logFail } from "../../failsafe/calls";
import type { DragDropPayload } from "../model";

/** Returns the Dock item under a file drag (its `data-dock-drag-key`), or null. */
export function useFileDrop(fileDropOn: boolean, aiOn: boolean, onAiDrop: (paths: string[]) => void): string | null {
  const [dropKey, setDropKey] = useState<string | null>(null);
  useEffect(() => {
    // Also active while AI is on, for dropping files on the sparkle (drop-to-AI).
    if (!fileDropOn && !aiOn) return;
    const target = (p?: { x: number; y: number }) => {
      if (!p) return null;
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(p.x / dpr, p.y / dpr) as HTMLElement | null;
      return el?.closest<HTMLElement>(fileDropOn ? "[data-dock-launch-path],[data-dock-ai-drop]" : "[data-dock-ai-drop]") ?? null;
    };
    const offs = [
      listen<DragDropPayload>("tauri://drag-over", (e) => {
        setDropKey(target(e.payload?.position)?.dataset.dockDragKey ?? null);
      }),
      listen<DragDropPayload>("tauri://drag-leave", () => setDropKey(null)),
      listen<DragDropPayload>("tauri://drag-drop", (e) => {
        const t = target(e.payload?.position);
        setDropKey(null);
        const files = e.payload?.paths ?? [];
        if (t?.dataset.dockAiDrop && files.length) {
          onAiDrop(files.slice(0, 20));
          return;
        }
        const appPath = t?.dataset.dockLaunchPath;
        if (!appPath || files.length === 0) return;
        invoke("open_files_with_app_cmd", { appPath, files }).catch(logFail("Dock", "open the dropped files"));
      }),
    ];
    return () => offs.forEach((u) => u.then((fn) => fn()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileDropOn, aiOn]);
  return dropKey;
}
