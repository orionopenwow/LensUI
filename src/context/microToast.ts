// What the one-line micro-save toast says. Pure, so it tests under bun.
import type { MicroSaved } from "./contract";
import { formatTokens } from "./packs";

export const TOAST_MS = 2400;
/** Longer while the note field is open or focused. */
export const TOAST_NOTE_MS = 8000;

export function microToastText(m: Pick<MicroSaved, "merged" | "duplicate" | "approx_tokens" | "quotes" | "title">): {
  title: string;
  detail: string;
} {
  if (m.duplicate) return { title: "Already on your Shelf", detail: m.title };
  if (m.merged) return { title: "Added to the same note", detail: `${m.quotes} quotes · ~${formatTokens(m.approx_tokens)} tok` };
  return { title: "Saved to Shelf", detail: `${m.title} · ~${formatTokens(m.approx_tokens)} tok` };
}

/** Appends a typed note under the saved item (same format the backend uses on save). */
export function withNote(text: string, note: string): string {
  const n = note.trim().slice(0, 500);
  return n ? `${text.trimEnd()}\n\n_Note: ${n}_` : text;
}
