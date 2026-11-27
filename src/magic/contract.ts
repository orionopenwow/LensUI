// Backend calls for the magic right-click window (src-tauri/src/commands/magic.rs).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConflictDto, LensTargetInput, MagicConfig, MagicOpen, MagicStatus, MagicTarget } from "../types/generated";
import { logFail } from "../failsafe/calls";

export type { ConflictDto, LensTargetInput, MagicConfig, MagicOpen, MagicStatus, MagicTarget };

export const EVT_MAGIC_OPEN = "lens://magic/open";

export const DEFAULT_MAGIC: MagicConfig = {
  enabled: false,
  trigger: "ctrl-alt-right",
  holdMs: 350,
  hotkey: "Ctrl+Alt+Q",
  exclude: [],
  defaultMode: "do",
  maxRows: 7,
  windowActions: true,
  ai: true,
  learn: false,
};

export const magicGetConfig = () => invoke<MagicConfig>("magic_get_config");
export const magicSetConfig = (cfg: MagicConfig) => invoke<MagicStatus>("magic_set_config", { cfg });
export const magicStatus = () => invoke<MagicStatus>("magic_status");
export const magicCheck = (cfg: MagicConfig, o: { altDragEnabled: boolean; altDragModifier: string; altDragResize: boolean; summonHotkeys: string[] }) =>
  invoke<ConflictDto[]>("magic_check", { cfg, ...o });
/** Opens at the cursor; Lens surfaces pass their own item. */
export const magicOpen = (lens?: LensTargetInput) => invoke<void>("magic_open", { lens: lens ?? null });
/** Opens the magic window for an item inside a Lens surface (a dock app, a Shelf item, a
 *  notification). Works even when the global trigger is off: the person asked for it on that item. */
export function magicOpenFor(
  kind: "dockItem" | "shelfItem" | "notification",
  id: string,
  label: string,
  path: string | null = null,
  run: string | null = null,
): Promise<void> {
  return magicOpen({ kind, id, label, path, run }).catch(logFail("Magic", `open the Magic window for ${kind}`));
}
export const magicLast = () => invoke<MagicOpen | null>("magic_last");
export const magicHide = () => invoke<void>("magic_hide");
export const magicWindowAction = (hwnd: number, action: string) => invoke<string>("magic_window_action", { hwnd, action });
export const magicReportOpen = (ms: number, resolveMs: number) => invoke<void>("magic_report_open", { ms, resolveMs });

export function onMagicOpen(handler: (p: MagicOpen) => void): Promise<UnlistenFn> {
  return listen<MagicOpen>(EVT_MAGIC_OPEN, (e) => handler(e.payload));
}
