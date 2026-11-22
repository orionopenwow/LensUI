/**
 * Lens unified search engine — pure ranking used by the Launcher, the Command Palette and the Dock search,
 * so all three order results the same way.
 */
import { scoreFields } from "./fuzzy";
import { calculate, type CalcResult } from "./calc";
import { usageBoost, type SearchUsage, getUsage } from "./usage";

export type SearchKind =
  | "nl"
  | "calc"
  | "shell"
  | "web"
  | "window"
  | "app"
  | "action"
  | "setting"
  | "script"
  | "folder"
  | "file";

export interface SearchItem {
  /** Stable key for learned ranking, e.g. "app:c:\\...\\code.lnk". */
  key: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  /** Extra words that should match but aren't shown. */
  keywords?: string;
  /** File/app path, used for icons and "show in folder". */
  path?: string;
  ext?: string;
  iconUrl?: string | null;
  badge?: string;
  /** Unix seconds (files). */
  modified?: number;
  /** When set, the first Enter/click only arms the item and shows this text; a second one runs it. */
  confirm?: string;
  /** Pinned specials (calculator, shell, web, NL plan) are placed by rule, not by score. */
  special?: "top" | "bottom";
  run: () => void | Promise<unknown>;
}

export interface RankedItem extends SearchItem {
  score: number;
}

const KIND_BOOST: Record<SearchKind, number> = {
  nl: 0,
  calc: 0,
  shell: 0,
  web: 0,
  window: 55,
  app: 50,
  action: 30,
  setting: 22,
  script: 22,
  folder: 14,
  file: 0,
};

export function itemScore(query: string, item: SearchItem, usage: SearchUsage, nowSec: number): number {
  const base = scoreFields(query, [
    [item.title, 1],
    [item.keywords, 0.86],
    [item.subtitle, 0.5],
  ]);
  if (base <= 0) return 0;
  let s = base + KIND_BOOST[item.kind] + usageBoost(item.key, query, usage, nowSec);
  if (item.kind === "file" && item.modified) {
    const days = (nowSec - item.modified) / 86400;
    if (days < 2) s += 40;
    else if (days < 14) s += 20;
  }
  return s;
}

/** Ranks ordinary items; specials go first ("top") or last ("bottom") in their given order. */
export function rankItems(
  query: string,
  items: SearchItem[],
  opts: { limit?: number; usage?: SearchUsage; nowSec?: number } = {}
): RankedItem[] {
  const q = query.trim();
  if (!q) return [];
  const usage = opts.usage ?? getUsage();
  const nowSec = opts.nowSec ?? Date.now() / 1000;
  const top: RankedItem[] = [];
  const bottom: RankedItem[] = [];
  const scored: RankedItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.key)) continue;
    if (it.special === "top") {
      top.push({ ...it, score: Infinity });
      seen.add(it.key);
      continue;
    }
    if (it.special === "bottom") {
      bottom.push({ ...it, score: -1 });
      seen.add(it.key);
      continue;
    }
    const s = itemScore(q, it, usage, nowSec);
    if (s > 0) {
      scored.push({ ...it, score: s });
      seen.add(it.key);
    }
  }
  scored.sort((a, b) => b.score - a.score || a.title.length - b.title.length);
  const limit = opts.limit ?? 40;
  return [...top, ...scored.slice(0, Math.max(0, limit - top.length - bottom.length)), ...bottom];
}

export type SearchTab = "all" | "apps" | "files" | "folders" | "recent";

/** Tab filter shared by the Palette and the Dock search. Specials stay visible on every tab. */
export function filterByTab<T extends SearchItem>(items: T[], tab: SearchTab): T[] {
  if (tab === "all") return items;
  return items.filter((i) => {
    if (i.special) return true;
    if (tab === "apps") return i.kind === "app" || i.kind === "action" || i.kind === "setting" || i.kind === "script";
    if (tab === "files") return i.kind === "file";
    if (tab === "folders") return i.kind === "folder";
    return i.kind === "window" || i.kind === "file";
  });
}

export interface SpecialHandlers {
  copy: (text: string) => void;
  openUrl: (url: string) => void;
  runShell: (command: string) => void;
}

/** "1,234.5 mi" -> "1234.5" (what you'd paste into another app). */
export function copyableNumber(value: string): string {
  const m = value.match(/^-?[\d,]*\.?\d+(e[+-]?\d+)?/i);
  return m ? m[0].replace(/,/g, "") : value;
}

export const WEB_SEARCH_URL = "https://www.google.com/search?q=";

/** "> cmd", "? query", calculator / unit conversion, and the web-search fallback. */
export function specialItems(query: string, h: SpecialHandlers): { items: SearchItem[]; exclusive: boolean; calc: CalcResult | null } {
  const raw = query.trim();
  if (!raw) return { items: [], exclusive: false, calc: null };

  if (raw.startsWith(">")) {
    const cmd = raw.slice(1).trim();
    return {
      exclusive: true,
      calc: null,
      items: cmd
        ? [
            {
              key: "shell",
              kind: "shell",
              special: "top",
              title: `Run command: ${cmd}`,
              subtitle: "Opens a Command Prompt window that stays open so you can see the output",
              badge: "Enter twice",
              confirm: `Press Enter again to run "${cmd}"`,
              run: () => h.runShell(cmd),
            },
          ]
        : [
            {
              key: "shell-hint",
              kind: "shell",
              special: "top",
              title: "Type a command to run",
              subtitle: "Example: > ipconfig /all",
              run: () => {},
            },
          ],
    };
  }

  if (raw.startsWith("?")) {
    const q = raw.slice(1).trim();
    return {
      exclusive: true,
      calc: null,
      items: [
        {
          key: "web",
          kind: "web",
          special: "top",
          title: q ? `Search the web for "${q}"` : "Type what to search the web for",
          subtitle: "Opens in your default browser",
          badge: "Web",
          run: () => {
            if (q) h.openUrl(WEB_SEARCH_URL + encodeURIComponent(q));
          },
        },
      ],
    };
  }

  const items: SearchItem[] = [];
  const calc = calculate(raw);
  if (calc) {
    items.push({
      key: "calc",
      kind: "calc",
      special: "top",
      title: calc.value,
      subtitle: `${calc.expression} · Enter copies the answer`,
      badge: calc.kind === "units" ? "Convert" : "Calculate",
      run: () => h.copy(copyableNumber(calc.value)),
    });
  }
  if (raw.length >= 2) {
    items.push({
      key: "web-fallback",
      kind: "web",
      special: "bottom",
      title: `Search the web for "${raw}"`,
      subtitle: "Opens in your default browser",
      badge: "Web",
      run: () => h.openUrl(WEB_SEARCH_URL + encodeURIComponent(raw)),
    });
  }
  return { items, exclusive: false, calc };
}
