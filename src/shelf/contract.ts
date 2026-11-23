// The Shelf — the fixed contract other packages build against (docs/SHELF.md).
// Backend: src-tauri/src/commands/shelf.rs. Keep the two in step.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ShelfKind = "text" | "page" | "selection" | "file" | "image" | "transcript" | "answer";

export interface ShelfItemInput {
  kind: ShelfKind;
  title?: string;
  text?: string;
  html?: string;
  url?: string;
  path?: string;
  source_app?: string;
  tags?: string[];
  /** Never send to a cloud provider. */
  local_only?: boolean;
}

export interface ShelfItem {
  id: string;
  shelf: string;
  kind: ShelfKind;
  title: string;
  text: string;
  html?: string | null;
  url?: string | null;
  path?: string | null;
  source_app?: string | null;
  tags: string[];
  pinned: boolean;
  local_only: boolean;
  created_ms: number;
  updated_ms: number;
  order: number;
  chars: number;
  approx_tokens: number;
}

export interface ShelfItemPatch {
  title?: string;
  text?: string;
  tags?: string[];
  shelf?: string;
  order?: number;
}

export interface ShelfInfo {
  id: string;
  name: string;
  created_ms: number;
  item_count: number;
  approx_tokens: number;
}

export interface ShelfContext {
  text: string;
  approx_tokens: number;
  trimmed: string[];
  local_only: boolean;
  item_count: number;
}

export const DEFAULT_SHELF = "default";
export const EVT_SHELF_CHANGED = "lens://shelf/changed";

export const shelfList = (shelf?: string) => invoke<ShelfItem[]>("shelf_list", { shelf });
export const shelfGet = (id: string) => invoke<ShelfItem>("shelf_get", { id });
export const shelfAdd = (item: ShelfItemInput, shelf?: string) => invoke<string>("shelf_add", { item, shelf });
export const shelfRemove = (id: string) => invoke<void>("shelf_remove", { id });
export const shelfUpdate = (id: string, patch: ShelfItemPatch) => invoke<void>("shelf_update", { id, patch });
export const shelfReorder = (id: string, index: number) => invoke<void>("shelf_reorder", { id, index });
export const shelfPin = (id: string, pinned: boolean) => invoke<void>("shelf_pin", { id, pinned });
export const shelfClear = (shelf: string, includePinned = false) =>
  invoke<number>("shelf_clear", { shelf, includePinned });
export const shelvesList = () => invoke<ShelfInfo[]>("shelves_list");
export const shelfCreate = (name: string) => invoke<ShelfInfo>("shelf_create", { name });
export const shelfRename = (shelf: string, name: string) => invoke<void>("shelf_rename", { shelf, name });
/** Deletes a shelf and its items. Confirm in the UI first. */
export const shelfDelete = (shelf: string) => invoke<number>("shelf_delete", { shelf });
export const shelfExport = (shelf: string, format: "md" | "json") => invoke<string>("shelf_export", { shelf, format });
export const shelfAsContext = (ids: string[], maxTokens?: number) =>
  invoke<ShelfContext>("shelf_as_context", { ids, maxTokens });

export function onShelfChanged(cb: (shelf: string | null) => void): Promise<UnlistenFn> {
  return listen<{ shelf: string | null }>(EVT_SHELF_CHANGED, (e) => cb(e.payload?.shelf ?? null));
}

/** Same estimate as the backend: ~4 chars per token for Latin script, 1 per wide character. */
export function approxTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) < 0x2e80) ascii++;
    else wide++;
  }
  return Math.ceil(ascii / 4) + wide;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${Math.round(n / 1000)}k tok`;
}
