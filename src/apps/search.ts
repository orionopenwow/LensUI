// Search, filtering and lookup over the Lens Apps catalogue. Pure; used by the UI, voice, Command
// and the Guide.
import type { Catalog, CatalogApp } from "./types";

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words people use for a category, so "slides" or "spreadsheet" finds the right shelf. */
export const CATEGORY_WORDS: Record<string, string[]> = {
  create: ["create", "art", "draw", "paint", "image", "photo", "video", "edit video", "audio", "music", "3d", "animation", "record"],
  docs: ["docs", "document", "documents", "word", "writing", "write", "pdf", "office", "report"],
  slides: ["slides", "slide", "presentation", "presentations", "deck", "keynote", "powerpoint"],
  sheets: ["sheets", "sheet", "spreadsheet", "spreadsheets", "excel", "data", "table"],
  design: ["design", "ui", "figma", "vector", "illustration", "whiteboard", "diagram", "layout"],
  notes: ["notes", "note", "notion", "knowledge", "wiki", "journal", "todo"],
  dev: ["code", "coding", "editor", "ide", "dev", "programming"],
  markets: ["charts", "charting", "chart", "stocks", "trading", "tradingview", "markets", "crypto"],
  media: ["player", "watch", "convert", "compress", "media"],
  utilities: ["utility", "utilities", "tools", "search files", "screenshot", "zip"],
  ai: ["ai", "model", "models", "llm", "local model", "chatbot", "transcribe", "transcription", "generate"],
};

/** Score one app against a query: higher is better, 0 means no match. */
export function score(app: CatalogApp, query: string): number {
  const q = normalise(query);
  if (!q) return 1;
  const name = normalise(app.name);
  const id = app.id.replace(/-/g, " ");
  let s = 0;
  if (name === q || id === q) s += 100;
  else if (name.startsWith(q) || id.startsWith(q)) s += 60;
  else if (name.split(" ").some((w) => w.startsWith(q))) s += 45;
  const replaces = app.replaces.map(normalise);
  if (replaces.some((r) => r === q)) s += 40;
  else if (replaces.some((r) => r.includes(q))) s += 25;
  const words = q.split(" ").filter((w) => w.length > 1);
  const hay = normalise(`${app.pitch} ${app.why} ${app.publisher} ${app.category}`);
  const hits = words.filter((w) => hay.includes(w)).length;
  if (words.length) s += Math.round((hits / words.length) * 20);
  if ((CATEGORY_WORDS[app.category] ?? []).some((w) => q === w || q.includes(w))) s += 15;
  return s;
}

export interface Filters {
  query: string;
  category: string | null;
  openSourceOnly: boolean;
  showNonOpenSource: boolean;
}

export function filterApps(apps: CatalogApp[], f: Filters): CatalogApp[] {
  const base = apps.filter(
    (a) =>
      (!f.category || a.category === f.category) &&
      (!f.openSourceOnly || a.openSource) &&
      (f.showNonOpenSource || a.openSource),
  );
  if (!normalise(f.query)) return base;
  return base
    .map((a) => ({ a, s: score(a, f.query) }))
    .filter((x) => x.s >= 15)
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a);
}

/** Finds the single app a spoken or typed name refers to, or the best few candidates. */
export function resolveApp(apps: CatalogApp[], spoken: string): { app: CatalogApp | null; candidates: CatalogApp[] } {
  const q = normalise(spoken.replace(/^(the|a|an)\s+/i, ""));
  if (!q) return { app: null, candidates: [] };
  const ranked = apps
    .map((a) => ({ a, s: score(a, q) }))
    .filter((x) => x.s >= 40)
    .sort((x, y) => y.s - x.s);
  if (!ranked.length) return { app: null, candidates: [] };
  const top = ranked[0];
  const clear = top.s >= 100 || ranked.length === 1 || top.s - ranked[1].s >= 20;
  return { app: clear ? top.a : null, candidates: ranked.slice(0, 4).map((x) => x.a) };
}

/** Category for a "what should I use for …" question. */
export function categoryFor(text: string): string | null {
  const q = ` ${normalise(text)} `;
  let best: { cat: string; len: number } | null = null;
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    for (const w of words) {
      if (q.includes(` ${w} `) && (!best || w.length > best.len)) best = { cat, len: w.length };
    }
  }
  return best?.cat ?? null;
}

/** The apps to recommend for a category: rewrites and essentials first, stable before alpha. */
export function recommend(catalog: Catalog, category: string, limit = 3): CatalogApp[] {
  const rank = (a: CatalogApp) =>
    (a.status === "stable" ? 0 : a.status === "beta" ? 1 : 3) +
    (a.collections.includes("essentials") ? -1 : 0) +
    (a.install.method === "via" ? 1 : 0);
  return catalog.apps
    .filter((a) => a.category === category)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Rails for the home screen: featured collections first, then each category. */
export function rails(catalog: Catalog, showNonOpenSource: boolean): { id: string; title: string; subtitle?: string; apps: CatalogApp[] }[] {
  const visible = catalog.apps.filter((a) => showNonOpenSource || a.openSource);
  const out: { id: string; title: string; subtitle?: string; apps: CatalogApp[] }[] = [];
  for (const c of catalog.collections) {
    if (c.id === "rewrites") continue; // shown as the hero row
    const apps = visible.filter((a) => a.collections.includes(c.id));
    if (apps.length) out.push({ id: `collection:${c.id}`, title: c.title, subtitle: c.subtitle, apps });
  }
  for (const c of catalog.categories) {
    const apps = visible.filter((a) => a.category === c.id);
    if (apps.length) out.push({ id: `category:${c.id}`, title: c.title, apps });
  }
  return out;
}

/** The hero row: open-source rewrites, one per thing they replace, apps before suite members. */
export function heroApps(catalog: Catalog, limit = 8): CatalogApp[] {
  const rw = catalog.apps.filter((a) => a.collections.includes("rewrites"));
  const order = (a: CatalogApp) => (a.install.method === "via" ? 1 : 0);
  return [...rw].sort((a, b) => order(a) - order(b)).slice(0, limit);
}
