/**
 * TEMPORARY SHIM: the Shelf contract (branch feature/shelf-command). The Shelf is a standing context
 * clipboard; its items can be attached to any AI request. When that branch merges, the integrator points
 * these imports at its real client and deletes this file.
 *
 * Contract (verbatim):
 *   shelf_list(shelf?)
 *   shelf_as_context(ids) -> {text, approx_tokens}
 *   shelf_add(item: {kind: "text"|"page"|"selection"|"file"|"image"|"transcript"|"answer",
 *                    title?, text?, html?, url?, path?, source_app?, tags?}, shelf?) -> id
 *   event lens://shelf/changed
 *   "Open in Lens Command": lens://command
 *
 * The item shape returned by shelf_list isn't specified; ShelfItem below lists the fields the AI surfaces
 * read, all optional except id.
 */
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { AiContext } from "./contract.shim";

export type ShelfKind = "text" | "page" | "selection" | "file" | "image" | "transcript" | "answer";

export interface ShelfItem {
  id: string;
  kind: ShelfKind | string;
  title?: string;
  text?: string;
  url?: string;
  path?: string;
  source_app?: string;
  tags?: string[];
  approx_tokens?: number;
  created?: number;
}

export interface ShelfNewItem {
  kind: ShelfKind;
  title?: string;
  text?: string;
  html?: string;
  url?: string;
  path?: string;
  source_app?: string;
  tags?: string[];
}

export const SHELF_CHANGED = "lens://shelf/changed";
export const COMMAND_EVENT = "lens://command";

export const shelfList = (shelf?: string) => invoke<ShelfItem[]>("shelf_list", { shelf });
export const shelfAsContext = (ids: string[]) => invoke<{ text: string; approx_tokens: number }>("shelf_as_context", { ids });
export const shelfAdd = (item: ShelfNewItem, shelf?: string) => invoke<string>("shelf_add", { item, shelf });

/** Payload sent on lens://command to continue a conversation in the full Lens Command surface. */
export interface CommandHandoff {
  action: "continue";
  prompt: string;
  answer?: string;
  context: AiContext;
  shelf_ids: string[];
  provider?: string;
}

export const openInCommand = (h: CommandHandoff) => emit(COMMAND_EVENT, h);
