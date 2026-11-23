// Right-click menu preferences, micro-saves and context packs: the frontend contract.
// Backend: src-tauri/src/commands/rightclick.rs (see docs/RIGHTCLICK.md).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MenuPrefs, UsageCounts } from "./actions";
import type { ShelfKind } from "../shelf/contract";

export const EVT_MICRO_SAVED = "lens://shelf/micro-saved";
export const EVT_PACKS_CHANGED = "lens://packs/changed";

// ---- menu preferences ----------------------------------------------------------------------------

export interface MenuState {
  prefs: Partial<MenuPrefs> | null;
  usage: UsageCounts;
}

export const contextMenuGet = () => invoke<MenuState>("context_menu_get");
export const contextMenuSet = (prefs: MenuPrefs) => invoke<void>("context_menu_set", { prefs });
/** Counts only when "learn from use" is on. */
export const contextMenuRecordUse = (id: string) => invoke<boolean>("context_menu_record_use", { id });
export const contextMenuReset = () => invoke<void>("context_menu_reset");

// ---- micro-saves ---------------------------------------------------------------------------------

export interface MicroInput {
  kind?: ShelfKind;
  text?: string;
  title?: string;
  url?: string;
  path?: string;
  source_app?: string;
  note?: string;
  local_only?: boolean;
}

export interface MicroSaved {
  id: string;
  shelf: string;
  title: string;
  merged: boolean;
  duplicate: boolean;
  approx_tokens: number;
  quotes: number;
}

export const shelfMicroSave = (input: MicroInput, shelf?: string) => invoke<MicroSaved>("shelf_micro_save", { input, shelf });
/** Ctrl+Alt+S: micro-save the selection in the app you're in (UI Automation, selection rules apply). */
export const selectionMicroSave = (note?: string) => invoke<MicroSaved>("selection_micro_save", { note });

export function onMicroSaved(handler: (m: MicroSaved) => void): Promise<UnlistenFn> {
  return listen<MicroSaved>(EVT_MICRO_SAVED, (e) => handler(e.payload));
}

// ---- context packs -------------------------------------------------------------------------------

export interface Pack {
  id: string;
  name: string;
  item_ids: string[];
  budget_tokens: number;
  auto_trim: boolean;
  created_ms: number;
  updated_ms: number;
}

export interface PackItemView {
  id: string;
  title: string;
  kind: string;
  url?: string | null;
  path?: string | null;
  approx_tokens: number;
  local_only: boolean;
  missing: boolean;
}

export interface TrimStep {
  id: string;
  from_tokens: number;
  to_tokens: number;
}

export interface PackView {
  pack: Pack;
  items: PackItemView[];
  total_tokens: number;
  over_budget: boolean;
  active: boolean;
  local_only: boolean;
  trim_plan: TrimStep[];
}

export interface PackSummary {
  id: string;
  name: string;
  item_count: number;
  total_tokens: number;
  budget_tokens: number;
  active: boolean;
}

export const packList = () => invoke<PackSummary[]>("pack_list");
export const packGet = (id: string) => invoke<PackView>("pack_get", { id });
export const packCreate = (name: string, items?: string[]) => invoke<Pack>("pack_create", { name, items });
export const packRename = (id: string, name: string) => invoke<void>("pack_rename", { id, name });
/** Deletes the pack only; its Shelf items stay. Confirm first. */
export const packDelete = (id: string) => invoke<void>("pack_delete", { id });
export const packSetItems = (id: string, items: string[]) => invoke<void>("pack_set_items", { id, items });
export const packAddItems = (id: string, items: string[]) => invoke<number>("pack_add_items", { id, items });
export const packRemoveItem = (id: string, item: string) => invoke<void>("pack_remove_item", { id, item });
export const packSetBudget = (id: string, budgetTokens: number, autoTrim: boolean) =>
  invoke<void>("pack_set_budget", { id, budgetTokens, autoTrim });
export const packSetActive = (id: string | null) => invoke<void>("pack_set_active", { id });
export const packActive = () => invoke<PackView | null>("pack_active");
export const packMarkdown = (id: string, replacements?: Record<string, string>) =>
  invoke<string>("pack_markdown", { id, replacements });
export const packExport = (id: string, format: "md" | "json") => invoke<string>("pack_export", { id, format });

export function onPacksChanged(handler: () => void): Promise<UnlistenFn> {
  return listen(EVT_PACKS_CHANGED, () => handler());
}

/** `lens://pack/<id>`: the MCP resource Claude Desktop / Claude Code attach. */
export const packResourceUri = (id: string) => `lens://pack/${id}`;
