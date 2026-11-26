// Lens Command's way into Magic Search: "magic search <query>" (also "lens search …", "search
// that", "/magicsearch …") opens the pop-out with that query. Exact prefixes only, so "search my
// files for x" still goes to the file search and questions about searching go to the AI.
import { invoke } from "@tauri-apps/api/core";

/** The query in a Magic Search phrase, or null when the text isn't one. */
export function magicSearchQuery(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  const m = /^(?:\/magicsearch|\/ms|magic search|magic-search|lens search)(?:\s+(?:for\s+)?(.*))?$/i.exec(t);
  if (!m) return null;
  const q = (m[1] ?? "").trim().replace(/^["“](.*)["”]$/, "$1").trim();
  return q || null;
}

/** "search that" / "magic search that": the current selection (read by the backend's rules). */
export function isSearchThat(text: string): boolean {
  return /^(?:magic )?search (?:that|this|the selection)[.!?]?$/i.test(text.trim());
}

/** Opens Magic Search; returns a line for Command if it couldn't. */
export async function openMagicSearch(query: string | null): Promise<string | null> {
  try {
    await invoke("magic_search_open", { query, action: null });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "Magic Search couldn't open.";
  }
}
