// Lens Magic Start: the pure parts (docs/MAGIC.md "Magic Start"; plan wave M4).
// What the panel lists and in which order, kept free of Tauri so it can be tested on its own.
import type { MagicWavesConfig } from "../../types/generated";

export interface AppLike {
  name: string;
  path: string;
}

export interface RecentLike {
  name: string;
  path: string;
  ageLabel?: string;
}

export interface ShelfLike {
  kind: string;
  title?: string | null;
  text?: string | null;
  url?: string | null;
  path?: string | null;
}

/** One row in the panel. `kind` decides what Enter / click does. */
export type StartEntry =
  | { kind: "app"; key: string; label: string; path: string }
  | { kind: "file"; key: string; label: string; path: string; hint?: string }
  | { kind: "shelf"; key: string; label: string; hint?: string }
  | { kind: "action"; key: string; label: string; action: MagicActionId; hint?: string };

export type MagicActionId = "magic" | "snip" | "dashboard" | "shelfNote" | "shelf" | "windowsStart";

export const MAX_PINNED = 12;
export const MAX_RECENT = 6;
export const MAX_RESULTS = 10;

/** Ranks apps for a query: whole-name start, then word start, then anywhere. Case and accents ignored. */
export function searchApps<T extends AppLike>(apps: readonly T[], query: string, limit = MAX_RESULTS): T[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { a: T; s: number }[] = [];
  for (const a of apps) {
    const n = fold(a.name);
    let s = -1;
    if (n.startsWith(q)) s = 0;
    else if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) s = 1;
    else if (n.includes(q)) s = 2;
    if (s >= 0) scored.push({ a, s });
  }
  scored.sort((x, y) => x.s - y.s || x.a.name.length - y.a.name.length || x.a.name.localeCompare(y.a.name));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const { a } of scored) {
    const k = a.path.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The Magic actions shown, in order. Each one only appears while its own wave is on. */
export function magicActions(flags: Pick<MagicWavesConfig, "dashboard" | "shelfNotes">): StartEntry[] {
  const out: StartEntry[] = [
    { kind: "action", key: "act:magic", label: "Ask Magic", action: "magic", hint: "Point Lens at anything" },
    { kind: "action", key: "act:snip", label: "Snip", action: "snip", hint: "Grab part of the screen" },
  ];
  if (flags.dashboard) out.push({ kind: "action", key: "act:dashboard", label: "Dashboard", action: "dashboard" });
  if (flags.shelfNotes) out.push({ kind: "action", key: "act:shelfNote", label: "Shelf → Note", action: "shelfNote" });
  out.push({ kind: "action", key: "act:shelf", label: "Open the Shelf", action: "shelf" });
  return out;
}

/** Pinned apps as entries (the Dock's own pins), capped. */
export function pinnedEntries(pins: readonly AppLike[]): StartEntry[] {
  return pins.slice(0, MAX_PINNED).map((p) => ({ kind: "app", key: `pin:${p.path.toLowerCase()}`, label: p.name, path: p.path }));
}

/** Recent files first, then the newest Shelf items, together capped at MAX_RECENT. */
export function recentEntries(files: readonly RecentLike[], shelf: readonly ShelfLike[]): StartEntry[] {
  const out: StartEntry[] = [];
  // Files get half the rows when the Shelf has something, all of them otherwise.
  const fileCap = shelf.length ? Math.ceil(MAX_RECENT / 2) : MAX_RECENT;
  for (const f of files) {
    if (out.length >= fileCap) break;
    out.push({ kind: "file", key: `file:${f.path.toLowerCase()}`, label: f.name, path: f.path, hint: f.ageLabel });
  }
  for (const [i, s] of shelf.entries()) {
    if (out.length >= MAX_RECENT) break;
    out.push({ kind: "shelf", key: `shelf:${i}`, label: shelfLabel(s), hint: "Shelf" });
  }
  return out.slice(0, MAX_RECENT);
}

export function shelfLabel(s: ShelfLike): string {
  const raw = s.title?.trim() || s.text?.trim() || s.url || s.path || s.kind;
  const line = raw.split(/\r?\n/)[0];
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

/** Everything the keyboard walks through, in screen order. */
export function navOrder(query: string, results: StartEntry[], pinned: StartEntry[], actions: StartEntry[], recent: StartEntry[]): StartEntry[] {
  return query.trim() ? results : [...pinned, ...actions, ...recent];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Up/Down across the panel as it is laid out: tiles sit in grids and rows in lists, so "down"
 * means the nearest entry on the next row, not the next entry in reading order. `boxes[i]` is
 * where entry i is on screen. Stays put at the top and bottom edge.
 */
export function moveVertical(boxes: readonly Box[], sel: number, dir: 1 | -1): number {
  const cur = boxes[sel];
  if (!cur) return moveSelection(sel, dir, boxes.length);
  const mid = (b: Box) => b.y + b.h / 2;
  const cx = cur.x + cur.w / 2;
  // The closest row beyond the current one in that direction…
  let rowY: number | null = null;
  for (const b of boxes) {
    const d = (mid(b) - mid(cur)) * dir;
    if (d > cur.h / 2 && (rowY === null || d < (rowY - mid(cur)) * dir)) rowY = mid(b);
  }
  if (rowY === null) return sel;
  // …and on it, the entry whose span is nearest to where we are.
  let best = sel;
  let bestD = Infinity;
  boxes.forEach((b, i) => {
    if (Math.abs(mid(b) - rowY!) > 1) return;
    const d = cx < b.x ? b.x - cx : cx > b.x + b.w ? cx - (b.x + b.w) : 0;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Arrow-key movement that clamps instead of wrapping. */
export function moveSelection(sel: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, sel + delta));
}
