// Clipboard history v2 (opt-in, encrypted at rest). Backend: src-tauri/src/commands/clip.rs.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ClipKind = "text" | "link" | "image" | "files";
export type PasteAs = "original" | "plain" | "markdown" | "trimmed";

export interface ClipView {
  id: number;
  kind: ClipKind;
  preview: string;
  chars: number;
  hasHtml: boolean;
  fileCount: number;
  thumbPng?: string | null;
  imageSize?: [number, number] | null;
  sourceApp?: string | null;
  url?: string | null;
  title?: string | null;
  tsMs: number;
  pinned: boolean;
  /** The source asked not to sync it: Lens never sends it to a cloud provider. */
  localOnly: boolean;
}

export interface ClipSettings {
  enabled: boolean;
  maxItems: number;
  maxDays: number;
  maxTotalBytes: number;
  maxItemBytes: number;
  excludedApps: string[];
  captureImages: boolean;
  captureFiles: boolean;
  preferPlainPaste: boolean;
}

export interface ClipStatus {
  enabled: boolean;
  pausedUntilMs: number;
  ignoreNext: boolean;
  count: number;
  pinned: number;
  settings: ClipSettings;
}

export const DEFAULT_EXCLUDED_APPS = [
  "1password.exe", "bitwarden.exe", "keepass.exe", "keepassxc.exe", "dashlane.exe", "lastpass.exe",
  "nordpass.exe", "enpass.exe", "roboform.exe", "keeper.exe", "protonpass.exe", "credentialuibroker.exe",
];

export const DEFAULT_CLIP_SETTINGS: ClipSettings = {
  enabled: false,
  maxItems: 500,
  maxDays: 30,
  maxTotalBytes: 64 * 1024 * 1024,
  maxItemBytes: 2 * 1024 * 1024,
  excludedApps: DEFAULT_EXCLUDED_APPS,
  captureImages: true,
  captureFiles: true,
  preferPlainPaste: false,
};

export const EVT_CLIP_CHANGED = "lens://clip/changed";

export const clipStatus = () => invoke<ClipStatus>("clip_status");
export const clipSetSettings = (settings: ClipSettings) => invoke<ClipStatus>("clip_set_settings", { settings });
export const clipList = (query = "", kind?: ClipKind) => invoke<ClipView[]>("clip_list", { query, kind });
export const clipGetText = (id: number) => invoke<string>("clip_get_text", { id });
export const clipPin = (id: number, pinned: boolean) => invoke<void>("clip_pin", { id, pinned });
export const clipRename = (id: number, title: string | null) => invoke<void>("clip_rename", { id, title });
export const clipDelete = (id: number) => invoke<void>("clip_delete", { id });
/** Clears the last `minutes` (undefined = all). Pinned clips stay unless includePinned. */
export const clipClear = (minutes?: number, includePinned = false) =>
  invoke<number>("clip_clear", { minutes, includePinned });
export const clipWipe = () => invoke<void>("clip_wipe");
export const clipPause = (minutes: number) => invoke<ClipStatus>("clip_pause", { minutes });
export const clipIgnoreNext = () => invoke<ClipStatus>("clip_ignore_next");
export const clipCopy = (id: number, mode: PasteAs = "original") => invoke<void>("clip_copy", { id, mode });
/** Hides Lens Command and pastes into the app you came from. Only call after the user picks. */
export const clipPaste = (id: number, mode: PasteAs = "original") => invoke<void>("clip_paste", { id, mode });
export const clipPasteText = (text: string) => invoke<void>("clip_paste_text", { text });
export const clipMerge = (ids: number[]) => invoke<string>("clip_merge", { ids });
export const clipToShelf = (ids: number[], shelf?: string) => invoke<string>("clip_to_shelf", { ids, shelf });

export function onClipChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(EVT_CLIP_CHANGED, () => cb());
}

export function sourceAppName(path?: string | null): string | null {
  if (!path) return null;
  const file = path.split(/[\\/]/).pop() ?? path;
  return file.replace(/\.exe$/i, "");
}

export function relativeTime(tsMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - tsMs) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d` : new Date(tsMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
