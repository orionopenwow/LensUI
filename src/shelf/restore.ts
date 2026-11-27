// Putting a removed Shelf item back (the Shelf drawer's Undo). Removing is immediate in the
// backend, so Undo adds the same content again; the item gets a new id and joins the end of its
// shelf. Pure.
import type { ShelfItem, ShelfItemInput } from "./contract";

/** How long the Undo strip stays after a remove. */
export const SHELF_UNDO_MS = 6000;

export function restoreInput(item: ShelfItem): ShelfItemInput {
  const input: ShelfItemInput = { kind: item.kind, title: item.title, tags: [...item.tags], local_only: item.local_only };
  if (item.text) input.text = item.text;
  if (item.html) input.html = item.html;
  if (item.url) input.url = item.url;
  if (item.path) input.path = item.path;
  if (item.source_app) input.source_app = item.source_app;
  return input;
}

/** "Removed “Quarterly notes”." with a long title cut short. */
export function removedLine(title: string, max = 36): string {
  const t = title.trim() || "the item";
  return `Removed “${t.length > max ? `${t.slice(0, max - 1)}…` : t}”.`;
}
