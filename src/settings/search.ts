// Settings search: one index over hub pages, their sections and the Windows Settings catalogue.
// Pure and synchronous so it runs on every keystroke and in unit tests.

import { GROUPS, PAGES, WINDOWS_SETTINGS, getPage, type PageDef, type PageId, type WinSetting } from "./registry";

export interface SearchEntry {
  kind: "page" | "section" | "windows";
  page: PageId;
  section?: string;
  /** For `windows` entries: the ms-settings URI to open. */
  uri?: string;
  label: string;
  /** "Windows › Sound › App volume" */
  breadcrumb: string;
  keywords: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function groupLabel(p: PageDef) {
  return GROUPS.find((g) => g.id === p.group)?.label ?? "";
}

export function buildIndex(pages: PageDef[] = PAGES, win: WinSetting[] = WINDOWS_SETTINGS): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of pages) {
    out.push({
      kind: "page",
      page: p.id,
      label: p.label,
      breadcrumb: `${groupLabel(p)} › ${p.label}`,
      keywords: [...p.keywords, ...p.controls, p.description],
    });
    for (const s of p.sections) {
      out.push({
        kind: "section",
        page: p.id,
        section: s.id,
        label: s.label,
        breadcrumb: `${groupLabel(p)} › ${p.label} › ${s.label}`,
        keywords: s.keywords ?? [],
      });
    }
  }
  for (const w of win) {
    const p = getPage(w.page);
    out.push({
      kind: "windows",
      page: w.page,
      uri: w.uri,
      label: w.label,
      breadcrumb: `Windows Settings › ${w.label}`,
      keywords: [...(w.keywords ?? []), p.label],
    });
  }
  return out;
}

/** Subsequence match ("btooth" → "bluetooth") as a weak last resort. */
function subsequence(q: string, text: string) {
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length;
}

function scoreText(q: string, text: string): number {
  const t = norm(text);
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 70;
  if (t.split(" ").some((w) => w.startsWith(q))) return 55;
  if (t.includes(q)) return 40;
  return 0;
}

export function scoreEntry(query: string, e: SearchEntry): number {
  const q = norm(query);
  if (!q) return 0;
  const words = q.split(" ");
  // Whole-query hits on the label beat keyword hits; keyword hits beat fuzzy hits.
  let best = scoreText(q, e.label) * 1.2;
  for (const k of e.keywords) best = Math.max(best, scoreText(q, k));
  if (best === 0 && words.length > 1) {
    // Every word must appear somewhere.
    const hay = norm([e.label, ...e.keywords].join(" "));
    if (words.every((w) => hay.includes(w))) best = 35;
  }
  if (best === 0 && q.length >= 4 && subsequence(q, norm(e.label))) best = 10;
  if (best === 0) return 0;
  // Prefer Lens's own pages over the Windows deep link when both match equally.
  const kindBias = e.kind === "page" ? 3 : e.kind === "section" ? 2 : 0;
  return best + kindBias;
}

export function search(query: string, index: SearchEntry[], limit = 8): SearchEntry[] {
  return index
    .map((e) => ({ e, s: scoreEntry(query, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length)
    .slice(0, limit)
    .map((x) => x.e);
}
