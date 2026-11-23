/**
 * The AI surfaces' view of the Shelf (src/shelf/contract.ts) and the hand-off to Lens Command.
 * It replaced the temporary shelf.shim.ts when the Shelf landed. Items are typed loosely here
 * because the surfaces only read a few fields.
 */
import { invoke } from "@tauri-apps/api/core";
import { EVT_SHELF_CHANGED, shelfAdd as addToShelf, shelfAsContext as shelfContext, shelfList as listShelf, type ShelfItemInput } from "../shelf/contract";
import type { AiContext } from "./surfaceApi";

export type ShelfKind = "text" | "page" | "selection" | "file" | "image" | "transcript" | "answer";

export interface ShelfItem {
  id: string;
  kind: ShelfKind | string;
  title?: string;
  text?: string;
  url?: string | null;
  path?: string | null;
  source_app?: string | null;
  tags?: string[];
  approx_tokens?: number;
  created_ms?: number;
}

export type ShelfNewItem = ShelfItemInput;

export const SHELF_CHANGED = EVT_SHELF_CHANGED;

export const shelfList = (shelf?: string): Promise<ShelfItem[]> => listShelf(shelf);
export const shelfAsContext = (ids: string[]) => shelfContext(ids);
export const shelfAdd = (item: ShelfNewItem, shelf?: string) => addToShelf(item, shelf);

/** What "Open in Lens Command" carries over from the Ask panel. */
export interface CommandHandoff {
  action: "continue";
  prompt: string;
  answer?: string;
  context: AiContext;
  shelf_ids: string[];
  provider?: string;
}

/** Opens the full Lens Command view with the prompt ready to continue. */
export const openInCommand = (h: CommandHandoff) =>
  invoke("show_command_cmd", { payload: { layout: "full", mode: "ask", text: h.prompt } });
