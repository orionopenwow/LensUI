// The one right-click action catalogue for Lens: the browser extension, Lens Browser, Explorer
// verbs, the Shelf, the Dock and Lens Mini all read actions.catalog.json and build their menus
// with the pure functions below. The Rust side reads the same JSON (src-tauri/src/bridge/actions.rs).
//
// Menus stay short: at most MAX_TOP items, the rest go under "More". Order = pinned, then the
// user's order, then catalogue order; "learn from use" (off by default) floats frequent actions up
// within the unpinned part using local counts only.
import catalogJson from "./actions.catalog.json";

export type ContextKind =
  | "selection" | "page" | "link" | "image" | "video" | "youtube" | "file" | "folder" | "window" | "app"
  | "clipboard" | "shelf" | "notification" | "desktop";

export type Provider = "local" | "default" | "claude" | "none";
export type Risk = "low" | "confirm";
export type Surface =
  | "browser" | "lensBrowser" | "explorer" | "shelf" | "dock" | "mini" | "clipboard" | "notification";

export interface ActionDef {
  id: string;
  label: string;
  icon: string;
  group: string;
  /** "file" matches any file; "file:media" only files of that type (see fileTypes). */
  contexts: string[];
  provider: Provider;
  risk: Risk;
  variants?: string[];
  surfaces: Surface[];
  /** Custom actions only: a prompt template with {selection} {clipboard} {shelf} {page} {lang} {title} {url}. */
  prompt?: string;
  custom?: boolean;
}

export interface Catalog {
  version: number;
  contexts: ContextKind[];
  fileTypes: Record<string, string[]>;
  actions: ActionDef[];
}

export const CATALOG = catalogJson as unknown as Catalog;
export const MAX_TOP = 7;
export const MAX_CUSTOM = 40;

/** Where the right-click happened. */
export interface MenuContext {
  kind: ContextKind;
  /** For files: the path or name (used for the extension → type). */
  path?: string;
  /** Several files selected. */
  count?: number;
  surface?: Surface;
}

export interface CustomAction {
  id: string; // "custom:<slug>"
  label: string;
  prompt: string;
  contexts: string[];
  provider: Provider;
}

export interface MenuPrefs {
  order: string[];
  hidden: string[];
  pinned: string[];
  custom: CustomAction[];
  /** Float frequently used actions up (local counts). Off by default. */
  learn: boolean;
}

export type UsageCounts = Record<string, number>;

export const DEFAULT_PREFS: MenuPrefs = { order: [], hidden: [], pinned: [], custom: [], learn: false };

export function fileTypeOf(path: string | undefined, catalog: Catalog = CATALOG): string[] {
  if (!path) return [];
  const m = /\.[^./\\]+$/.exec(path.toLowerCase());
  if (!m) return [];
  return Object.entries(catalog.fileTypes)
    .filter(([, exts]) => exts.includes(m[0]))
    .map(([t]) => t);
}

/** Does the action apply where the user right-clicked? */
export function appliesTo(a: Pick<ActionDef, "contexts" | "surfaces" | "id">, ctx: MenuContext, catalog: Catalog = CATALOG): boolean {
  if (ctx.surface && a.surfaces && !a.surfaces.includes(ctx.surface)) return false;
  // "Ask about these files" is for several items (when the caller knows how many are selected).
  if (a.id === "ask_files" && ctx.count !== undefined && ctx.count < 2) return false;
  const types = ctx.kind === "file" ? fileTypeOf(ctx.path, catalog) : [];
  return a.contexts.some((c) => {
    const [kind, type] = c.split(":");
    if (kind !== ctx.kind) return false;
    return !type || types.includes(type);
  });
}

export function customToDef(c: CustomAction): ActionDef {
  return {
    id: c.id, label: c.label, icon: "sparkles", group: "custom", contexts: c.contexts, provider: c.provider,
    risk: c.provider === "claude" ? "confirm" : "low",
    surfaces: ["browser", "lensBrowser", "shelf", "dock", "mini", "clipboard", "notification"],
    prompt: c.prompt, custom: true,
  };
}

export function allActions(prefs: MenuPrefs = DEFAULT_PREFS, catalog: Catalog = CATALOG): ActionDef[] {
  return [...catalog.actions, ...prefs.custom.map(customToDef)];
}

/** Every action in display order (ignores context). */
export function orderedActions(prefs: MenuPrefs = DEFAULT_PREFS, usage: UsageCounts = {}, catalog: Catalog = CATALOG): ActionDef[] {
  const all = allActions(prefs, catalog);
  const byId = new Map(all.map((a) => [a.id, a]));
  const base: ActionDef[] = [];
  const seen = new Set<string>();
  for (const id of [...prefs.order, ...all.map((a) => a.id)]) {
    const a = byId.get(id);
    if (a && !seen.has(id)) {
      seen.add(id);
      base.push(a);
    }
  }
  const pinned = prefs.pinned.map((id) => byId.get(id)).filter((a): a is ActionDef => !!a);
  const pinnedIds = new Set(pinned.map((a) => a.id));
  let rest = base.filter((a) => !pinnedIds.has(a.id));
  if (prefs.learn) {
    const idx = new Map(rest.map((a, i) => [a.id, i]));
    rest = [...rest].sort((x, y) => (usage[y.id] ?? 0) - (usage[x.id] ?? 0) || idx.get(x.id)! - idx.get(y.id)!);
  }
  return [...pinned, ...rest];
}

export interface Menu {
  top: ActionDef[];
  more: ActionDef[];
}

/** The menu for one right-click: short top list, the rest under "More". Hidden actions are left out. */
export function menuFor(ctx: MenuContext, prefs: MenuPrefs = DEFAULT_PREFS, usage: UsageCounts = {}, catalog: Catalog = CATALOG): Menu {
  const hidden = new Set(prefs.hidden);
  const list = orderedActions(prefs, usage, catalog).filter((a) => !hidden.has(a.id) && appliesTo(a, ctx, catalog));
  return { top: list.slice(0, MAX_TOP), more: list.slice(MAX_TOP) };
}

export function recordUse(usage: UsageCounts, id: string): UsageCounts {
  return { ...usage, [id]: Math.min(1_000_000, (usage[id] ?? 0) + 1) };
}

// ---- preferences editing (pure) ------------------------------------------------------------------

export function move(prefs: MenuPrefs, id: string, toIndex: number, catalog: Catalog = CATALOG): MenuPrefs {
  const ids = orderedActions({ ...prefs, pinned: [], learn: false }, {}, catalog).map((a) => a.id);
  const from = ids.indexOf(id);
  if (from < 0) return prefs;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
  return { ...prefs, order: ids };
}

export function togglePin(prefs: MenuPrefs, id: string): MenuPrefs {
  const pinned = prefs.pinned.includes(id) ? prefs.pinned.filter((p) => p !== id) : [...prefs.pinned, id];
  return { ...prefs, pinned, hidden: prefs.hidden.filter((h) => h !== id) };
}

export function toggleHidden(prefs: MenuPrefs, id: string): MenuPrefs {
  const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id];
  return { ...prefs, hidden, pinned: prefs.pinned.filter((p) => p !== id) };
}

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "action";
}

export const TEMPLATE_VARS = ["selection", "clipboard", "shelf", "page", "lang", "title", "url"];

/** Problems with a custom action (empty = OK). */
export function validateCustom(c: Partial<CustomAction>, catalog: Catalog = CATALOG): string[] {
  const p: string[] = [];
  if (!c.label || !c.label.trim()) p.push("Give the action a name.");
  if ((c.label ?? "").length > 48) p.push("Keep the name under 48 characters.");
  if (!c.prompt || !c.prompt.trim()) p.push("Write the prompt.");
  if ((c.prompt ?? "").length > 4000) p.push("Keep the prompt under 4,000 characters.");
  for (const m of (c.prompt ?? "").matchAll(/\{([a-z_]+)\}/g)) {
    if (!TEMPLATE_VARS.includes(m[1])) p.push(`Unknown placeholder {${m[1]}}.`);
  }
  if (!c.contexts?.length) p.push("Choose where it appears.");
  for (const ctx of c.contexts ?? []) {
    const [kind, type] = ctx.split(":");
    if (!catalog.contexts.includes(kind as ContextKind)) p.push(`Unknown place “${ctx}”.`);
    if (type && !catalog.fileTypes[type]) p.push(`Unknown file type “${type}”.`);
  }
  if (c.provider && !["local", "default", "claude", "none"].includes(c.provider)) p.push("Unknown engine.");
  return p;
}

export function addCustom(prefs: MenuPrefs, c: Omit<CustomAction, "id">, catalog: Catalog = CATALOG): MenuPrefs {
  const problems = validateCustom(c, catalog);
  if (problems.length) throw new Error(problems[0]);
  if (prefs.custom.length >= MAX_CUSTOM) throw new Error(`You can keep up to ${MAX_CUSTOM} custom actions.`);
  const base = `custom:${slugify(c.label)}`;
  let id = base;
  for (let n = 2; prefs.custom.some((x) => x.id === id); n++) id = `${base}-${n}`;
  return { ...prefs, custom: [...prefs.custom, { ...c, id }] };
}

export function removeCustom(prefs: MenuPrefs, id: string): MenuPrefs {
  return {
    ...prefs,
    custom: prefs.custom.filter((c) => c.id !== id),
    order: prefs.order.filter((o) => o !== id),
    pinned: prefs.pinned.filter((o) => o !== id),
    hidden: prefs.hidden.filter((o) => o !== id),
  };
}

/** Fills a custom prompt's placeholders. Missing values become empty strings. */
export function expandPrompt(template: string, vars: Partial<Record<string, string>>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, k) => (TEMPLATE_VARS.includes(k) ? vars[k] ?? "" : `{${k}}`));
}

// ---- import / export -----------------------------------------------------------------------------

export const EXPORT_KIND = "lens-context-menu";

export function exportPrefs(prefs: MenuPrefs): string {
  return JSON.stringify({ kind: EXPORT_KIND, version: 1, prefs }, null, 2);
}

/** Parses an exported file. Unknown ids are dropped; invalid custom actions are skipped (reported). */
export function importPrefs(text: string, catalog: Catalog = CATALOG): { prefs: MenuPrefs; skipped: string[] } {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!raw || raw.kind !== EXPORT_KIND || typeof raw.prefs !== "object") throw new Error("That isn't a Lens context-menu file.");
  const skipped: string[] = [];
  const custom: CustomAction[] = [];
  for (const c of Array.isArray(raw.prefs.custom) ? raw.prefs.custom.slice(0, MAX_CUSTOM) : []) {
    const clean: CustomAction = {
      id: typeof c?.id === "string" && /^custom:[a-z0-9-]{1,48}$/.test(c.id) ? c.id : `custom:${slugify(String(c?.label ?? ""))}`,
      label: String(c?.label ?? "").slice(0, 48),
      prompt: String(c?.prompt ?? ""),
      contexts: Array.isArray(c?.contexts) ? c.contexts.map(String) : [],
      provider: ["local", "default", "claude", "none"].includes(c?.provider) ? c.provider : "local",
    };
    const problems = validateCustom(clean, catalog);
    if (problems.length || custom.some((x) => x.id === clean.id)) skipped.push(clean.label || "(unnamed)");
    else custom.push(clean);
  }
  const known = new Set([...catalog.actions.map((a) => a.id), ...custom.map((c) => c.id)]);
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter((id) => known.has(id)))] : []);
  return {
    prefs: { order: ids(raw.prefs.order), hidden: ids(raw.prefs.hidden), pinned: ids(raw.prefs.pinned), custom, learn: raw.prefs.learn === true },
    skipped,
  };
}

/** Labels for the context picker in the settings card. */
export const CONTEXT_LABELS: Record<string, string> = {
  selection: "Selected text", page: "Web page", link: "Link", image: "Image", video: "Video", youtube: "YouTube video",
  file: "File", folder: "Folder", window: "Window", app: "App", clipboard: "Clipboard item", shelf: "Shelf item",
  notification: "Notification", desktop: "Desktop",
};
