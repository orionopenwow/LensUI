// Typed wrappers for the Lens Snip commands (src-tauri/src/commands/snip.rs).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Analysis, ExportResult, PinInfo, RecentTarget, RecordState, SessionInfo, SnipEntry, SnipInfo, SnipSettings, SnipStatus,
  WindowInfo, Rect as PhysRect,
} from "../types/generated";

export type { Analysis, ExportResult, PinInfo, RecentTarget, RecordState, SessionInfo, SnipEntry, SnipInfo, SnipSettings, SnipStatus, WindowInfo };

export const EVT = {
  begin: "lens://snip/begin",
  studio: "lens://snip/studio",
  record: "lens://snip/record",
  scroll: "lens://snip/scroll",
  history: "lens://snip/history",
  error: "lens://snip/error",
} as const;

export const DEFAULT_SNIP_SETTINGS: SnipSettings = {
  enabled: false,
  hotkey: "Ctrl+Shift+S",
  printScreen: false,
  defaultMode: "region",
  delaySeconds: 0,
  includeCursor: false,
  afterCapture: "studio",
  saveDir: "",
  filenameTemplate: "Lens Snip {date} at {time}",
  autoRedact: true,
  ocrLanguage: "auto",
  beautify: "none",
  pinOpacity: 1,
  pinClickThrough: false,
  recordFps: 30,
  recordFormat: "mp4",
  recordQuality: "balanced",
  recordMic: "",
  recordClickHighlight: true,
  historyEnabled: true,
  historyDays: 30,
  historyMax: 500,
  historyMaxMb: 1024,
  showRecent: true,
};

export const snipStatus = () => invoke<SnipStatus>("snip_status");
export const snipSetSettings = (settings: SnipSettings) => invoke<SnipStatus>("snip_set_settings", { settings });
export const snipStart = (mode?: string, delay?: number) => invoke<null>("snip_start", { mode: mode ?? null, delay: delay ?? null });
export const snipSession = () => invoke<SessionInfo | null>("snip_session");
export const snipElements = (hwnd: number, x: number, y: number) => invoke<PhysRect[]>("snip_elements", { hwnd, x, y });
export const snipCommit = (req: { kind: string; rect?: PhysRect | null; hwnd?: number | null }) =>
  invoke<SnipInfo>("snip_commit", { req: { kind: req.kind, rect: req.rect ?? null, hwnd: req.hwnd ?? null } });
export const snipTakePending = () => invoke<SnipInfo | null>("snip_take_pending");
export const snipClose = () => invoke<null>("snip_close");
export const snipAnalyze = (id: string) => invoke<Analysis>("snip_analyze", { id });
export const snipExport = (req: { id: string; png: string; action: "copy" | "save" | "pin" | "shelf"; ocrText?: string; title?: string; tags?: string[] }) =>
  invoke<ExportResult>("snip_export", { req: { ocrText: null, title: null, tags: null, ...req } });
export const snipToClaude = (req: { id: string; png: string; ocrText?: string; target: "desktop" | "command"; prompt?: string }) =>
  invoke<ExportResult>("snip_to_claude", { req: { ocrText: null, prompt: null, ...req } });
export const snipShare = (id: string, png: string) => invoke<ExportResult>("snip_share", { id, png });
export const snipRecent = () => invoke<RecentTarget[]>("snip_recent");
export const snipRecentClear = () => invoke<null>("snip_recent_clear");
export const snipRunningApps = () => invoke<WindowInfo[]>("snip_running_apps");
export const snipOpenIn = (id: string, png: string, exe: string) => invoke<ExportResult>("snip_open_in", { req: { id, png, exe } });
export const snipPinInfo = (label: string) => invoke<PinInfo>("snip_pin_info", { label });
export const snipPinClickThrough = (label: string, on: boolean) => invoke<null>("snip_pin_click_through", { label, on });
export const snipPinClose = (label: string) => invoke<null>("snip_pin_close", { label });
export const snipPinsRelease = () => invoke<null>("snip_pins_release");
export const snipHistory = (query?: string) => invoke<SnipEntry[]>("snip_history", { query: query ?? null });
export const snipHistoryOpen = (id: string) => invoke<SnipInfo>("snip_history_open", { id });
export const snipHistoryDelete = (id: string) => invoke<null>("snip_history_delete", { id });
export const snipHistoryPin = (id: string, pinned: boolean) => invoke<null>("snip_history_pin", { id, pinned });
export const snipHistoryTags = (id: string, tags: string[]) => invoke<null>("snip_history_tags", { id, tags });
export const snipHistoryClear = () => invoke<number>("snip_history_clear");
export const snipRecordStart = (rect: PhysRect) => invoke<RecordState>("snip_record_start", { rect });
export const snipRecordStop = () => invoke<RecordState>("snip_record_stop");
export const snipRecordState = () => invoke<RecordState>("snip_record_state");
export const snipRecordTrim = (path: string, start: number, end: number) => invoke<string>("snip_record_trim", { path, start, end });
export const snipRecordMics = () => invoke<string[]>("snip_record_mics");
export const snipScrollCapture = (hwnd: number) => invoke<SnipInfo>("snip_scroll_capture", { hwnd });

export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}
