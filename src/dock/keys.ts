// Dock keys: the Dock worked from the keyboard. With an icon focused (Tab from search, or after a
// click), the arrow keys along the Dock move between icons, Home and End jump to the ends, the
// arrow that points into the screen opens the app's window list, and typing finds an app by name.
// Pure rules here (src/__tests__/dockKeys.test.ts); useDockKeys.ts applies them to the page.
import type { DockEdge } from "./model";

/** Typing pauses longer than this start a new search. */
export const FIND_IDLE_MS = 900;

export type DockKeyAction =
  /** Focus the icon at this index. */
  | { kind: "move"; to: number }
  /** Open the focused app's window list and move into it. */
  | { kind: "windows" }
  /** Type-to-find: the text so far and the icon it lands on (-1: nothing matches). */
  | { kind: "find"; query: string; to: number }
  /** Stop finding (Esc, or the text was deleted). */
  | { kind: "clear" };

export interface DockKeyInput {
  key: string;
  /** Ctrl, Alt or the Windows key is held: never ours. */
  modified: boolean;
  edge: DockEdge;
  /** Index of the focused icon, and how many there are. */
  index: number;
  count: number;
  /** Each icon's name, in Dock order. */
  names: string[];
  /** Find text so far ("" when not finding). */
  query: string;
}

/** The arrows that run along the Dock on an edge, and the one that points into the screen. */
export function dockArrows(edge: DockEdge): { prev: string; next: string; into: string } {
  switch (edge) {
    case "left":
      return { prev: "ArrowUp", next: "ArrowDown", into: "ArrowRight" };
    case "right":
      return { prev: "ArrowUp", next: "ArrowDown", into: "ArrowLeft" };
    case "top":
      return { prev: "ArrowLeft", next: "ArrowRight", into: "ArrowDown" };
    default:
      return { prev: "ArrowLeft", next: "ArrowRight", into: "ArrowUp" };
  }
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** How well a name answers the text: 3 starts with it, 2 a word starts with it, 1 contains it, 0 no. */
export function findRank(name: string, query: string): number {
  const n = fold(name);
  const q = fold(query).trim();
  if (!q) return 0;
  if (n.startsWith(q)) return 3;
  if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}

/**
 * The icon a find lands on: the best-ranked name, the earliest in Dock order among equals. One
 * letter typed again and again steps through the apps that start with it (s, s, s: Slack,
 * Spotify, Steam), like a file list.
 */
export function findTarget(names: string[], query: string, from: number): number {
  const q = fold(query);
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  if (repeated) {
    const hits = names.map((n, i) => (findRank(n, q[0]) === 3 ? i : -1)).filter((i) => i >= 0);
    if (hits.length > 1) {
      const after = hits.find((i) => i > from);
      return after ?? hits[0];
    }
  }
  let best = -1;
  let bestRank = 0;
  names.forEach((n, i) => {
    const r = findRank(n, query);
    if (r > bestRank) {
      best = i;
      bestRank = r;
    }
  });
  return best;
}

/** Which icons a find text matches at all (the rest step back while finding). */
export function findHits(names: string[], query: string): boolean[] {
  const q = fold(query);
  const letter = q.length > 1 && [...q].every((c) => c === q[0]) && names.filter((n) => findRank(n, q[0]) === 3).length > 1 ? q[0] : query;
  return names.map((n) => findRank(n, letter) > 0);
}

/** What a key does with a Dock icon focused, or null when the key isn't the Dock's. */
export function dockKeyAction(i: DockKeyInput): DockKeyAction | null {
  if (i.modified || i.count === 0) return null;
  const arrows = dockArrows(i.edge);
  const clamp = (n: number) => Math.min(i.count - 1, Math.max(0, n));
  if (i.key === arrows.prev) return { kind: "move", to: clamp(i.index - 1) };
  if (i.key === arrows.next) return { kind: "move", to: clamp(i.index + 1) };
  if (i.key === "Home") return { kind: "move", to: 0 };
  if (i.key === "End") return { kind: "move", to: i.count - 1 };
  if (i.key === arrows.into) return { kind: "windows" };
  if (i.key === "Escape") return i.query ? { kind: "clear" } : null;
  if (i.key === "Backspace" && i.query) {
    const query = i.query.slice(0, -1);
    return query ? { kind: "find", query, to: findTarget(i.names, query, i.index) } : { kind: "clear" };
  }
  // One printable character. Space presses the button unless a name is being typed.
  if ([...i.key].length === 1 && (i.key !== " " || i.query)) {
    const query = i.query + i.key;
    return { kind: "find", query, to: findTarget(i.names, query, i.index) };
  }
  return null;
}

/** What a key does inside an app's window list (rows top to bottom), or null. */
export type ListKeyAction = { kind: "move"; to: number } | { kind: "close" } | { kind: "back" };

export function listKeyAction(key: string, index: number, count: number): ListKeyAction | null {
  if (count === 0) return key === "Escape" ? { kind: "back" } : null;
  if (key === "ArrowDown") return { kind: "move", to: (index + 1) % count };
  if (key === "ArrowUp") return { kind: "move", to: (index - 1 + count) % count };
  if (key === "Home") return { kind: "move", to: 0 };
  if (key === "End") return { kind: "move", to: count - 1 };
  if (key === "Delete") return { kind: "close" };
  if (key === "Escape") return { kind: "back" };
  return null;
}
