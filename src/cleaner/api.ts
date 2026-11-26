// Thin IPC wrappers for Lens Cleaner (commands in src-tauri/src/commands/cleaner.rs).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppUsage,
  CleanerSettings,
  ConfirmCode,
  HistoryView,
  Outcome,
  Overview,
  Pick,
  Preview,
  ScanProgress,
  ScanReport,
  SpaceNode,
  SpaceProgress,
  SpaceSummary,
  SpaceView,
  UndoResult,
  Verdict,
} from "./types";

export const EVENTS = {
  progress: "lens://cleaner/progress",
  space: "lens://cleaner/space-progress",
  move: "lens://cleaner/move-progress",
  lowSpace: "lens://cleaner/low-space",
  focus: "lens://cleaner/focus",
} as const;

export const api = {
  overview: () => invoke<Overview>("cleaner_overview"),
  scan: () => invoke<ScanReport>("cleaner_scan"),
  cancel: () => invoke<void>("cleaner_cancel"),
  preview: (categories: string[], picks: Pick[], smart = false) => invoke<Preview>("cleaner_preview", { categories, picks, smart }),
  previewPaths: (paths: string[], permanent: boolean) => invoke<Preview>("cleaner_preview_paths", { paths, permanent }),
  fullList: (id: string) => invoke<string>("cleaner_full_list", { id }),
  /** One-time code for a permanent delete. Only the Cleaner window is given one. */
  confirmCode: (id: string) => invoke<ConfirmCode>("cleaner_confirm_code", { id }),
  run: (id: string, confirm?: string | null) => invoke<Outcome>("cleaner_run", { id, confirm: confirm ?? null }),
  undo: () => invoke<UndoResult>("cleaner_undo"),
  spaceScan: (root: string) => invoke<SpaceSummary>("cleaner_space_scan", { root }),
  spaceChildren: (root: string, id: number, depth = 1, limit = 60) => invoke<SpaceView>("cleaner_space_children", { root, id, depth, limit }),
  spaceFind: (root: string, path: string) => invoke<number | null>("cleaner_space_find", { root, path }),
  biggest: (root: string, kind: string, limit = 40) => invoke<SpaceNode[]>("cleaner_biggest", { root, kind, limit }),
  reveal: (path: string) => invoke<void>("cleaner_reveal", { path }),
  open: (uri: string) => invoke<void>("cleaner_open", { uri }),
  apps: () => invoke<AppUsage[]>("cleaner_apps"),
  downloadsReview: () => invoke<Verdict[]>("cleaner_downloads_review"),
  move: (path: string, destDir: string) => invoke<string>("cleaner_move", { path, destDir }),
  history: (root: string) => invoke<HistoryView>("cleaner_history", { root }),
  settingsGet: () => invoke<CleanerSettings>("cleaner_settings_get"),
  settingsSet: (next: CleanerSettings) => invoke<CleanerSettings>("cleaner_settings_set", { next }),
  share: (png: string) => invoke<string>("cleaner_share", { png }),
  close: () => invoke<void>("hide_surface", { label: "cleaner" }),
};

export function on<T>(event: string, fn: (payload: T) => void): () => void {
  let un: UnlistenFn | null = null;
  let dead = false;
  listen<T>(event, (e) => fn(e.payload))
    .then((u) => {
      if (dead) u();
      else un = u;
    })
    .catch(() => {});
  return () => {
    dead = true;
    un?.();
  };
}

export type { ScanProgress, SpaceProgress };
