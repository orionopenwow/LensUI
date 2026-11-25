// Lens acting on your tabs, from the sidebar's Lens row: tidy, close duplicates, group by site,
// summarise. Pure planning lives here (unit-tested in src/__tests__/browserSidebar.test.ts); the
// sidebar shows the plan and nothing changes until the person presses Apply. Summarise changes
// nothing (it opens the Ask panel with a prompt), so it needs no confirmation.
import type { BrowserState, SidebarPrefs, Tab } from "./api";
import { hostOf, tabLabel } from "./model";

export const DAY_MS = 86_400_000;

export type TabActionKind = "tidy" | "duplicates" | "group-site" | "summarise";

export interface TabProposal {
  kind: Exclude<TabActionKind, "summarise">;
  title: string;
  /** One line per change, shown before anything happens. */
  lines: { id: string; text: string; detail?: string }[];
  /** Tabs to close (duplicates). */
  close: string[];
  /** Tabs to archive (tidy: unused for a day). */
  archive: string[];
  /** New folders to make, with the tabs that go in each (group by site). */
  folders: { name: string; tabs: string[] }[];
}

/** The tabs of the active space that are open (not archived). */
function spaceTabs(s: BrowserState): Tab[] {
  return s.tabs.filter((t) => t.spaceId === s.activeSpace && !t.archivedMs);
}

/** Same page, ignoring the fragment and a trailing slash (mirrors `tidy` in browser/model.rs). */
export function pageKey(url: string): string {
  return (url.split("#")[0] ?? url).replace(/\/+$/, "");
}

/**
 * Duplicates to close: for each page open more than once, keep the most recently used tab and
 * close the others, never a pinned, busy (unsaved) or active tab. Same rule as the backend.
 */
export function duplicateTabs(s: BrowserState): Tab[] {
  const seen = new Set<string>();
  const out: Tab[] = [];
  for (const t of [...spaceTabs(s)].sort((a, b) => b.lastActiveMs - a.lastActiveMs)) {
    const key = pageKey(t.url);
    if (seen.has(key)) {
      if (!t.pinned && !t.busy && t.id !== s.activeTab) out.push(t);
    } else seen.add(key);
  }
  return out;
}

/** What Tidy (Ctrl+Shift+K, `browser_tidy`) will do: close duplicates, archive tabs unused for a day. */
export function tidyPreview(s: BrowserState, now: number): { close: Tab[]; archive: Tab[] } {
  const close = duplicateTabs(s);
  const closing = new Set(close.map((t) => t.id));
  const archive = spaceTabs(s).filter(
    (t) => !closing.has(t.id) && !t.pinned && !t.busy && t.id !== s.activeTab && now - t.lastActiveMs >= DAY_MS,
  );
  return { close, archive };
}

/** Loose tabs (not pinned, not in a folder) on the same site, two or more per site. */
export function siteGroups(s: BrowserState): { host: string; tabs: Tab[] }[] {
  const known = new Set(s.folders.filter((f) => f.spaceId === s.activeSpace).map((f) => f.id));
  const by = new Map<string, Tab[]>();
  for (const t of spaceTabs(s).sort((a, b) => a.order - b.order)) {
    if (t.pinned || (t.folderId && known.has(t.folderId))) continue;
    const h = hostOf(t.url);
    if (!h) continue;
    by.set(h, [...(by.get(h) ?? []), t]);
  }
  return [...by.entries()].filter(([, tabs]) => tabs.length > 1).map(([host, tabs]) => ({ host, tabs }));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Builds the plan for an action. Never changes anything. `null` when there is nothing to do. */
export function propose(kind: Exclude<TabActionKind, "summarise">, s: BrowserState, now: number): TabProposal | null {
  if (kind === "duplicates") {
    const close = duplicateTabs(s);
    if (!close.length) return null;
    return {
      kind,
      title: `Close ${plural(close.length, "duplicate")}`,
      lines: close.map((t) => ({ id: t.id, text: tabLabel(t), detail: "close" })),
      close: close.map((t) => t.id),
      archive: [],
      folders: [],
    };
  }
  if (kind === "tidy") {
    const { close, archive } = tidyPreview(s, now);
    if (!close.length && !archive.length) return null;
    return {
      kind,
      title: [close.length ? `close ${plural(close.length, "duplicate")}` : "", archive.length ? `archive ${plural(archive.length, "old tab")}` : ""]
        .filter(Boolean)
        .join(", ")
        .replace(/^./, (c) => c.toUpperCase()),
      lines: [
        ...close.map((t) => ({ id: t.id, text: tabLabel(t), detail: "close" })),
        ...archive.map((t) => ({ id: t.id, text: tabLabel(t), detail: "archive" })),
      ],
      close: close.map((t) => t.id),
      archive: archive.map((t) => t.id),
      folders: [],
    };
  }
  const groups = siteGroups(s);
  if (!groups.length) return null;
  return {
    kind,
    title: `Group ${plural(groups.reduce((n, g) => n + g.tabs.length, 0), "tab")} into ${plural(groups.length, "folder")}`,
    lines: groups.map((g) => ({ id: g.host, text: g.host, detail: plural(g.tabs.length, "tab") })),
    close: [],
    archive: [],
    folders: groups.map((g) => ({ name: g.host, tabs: g.tabs.map((t) => t.id) })),
  };
}

/** What applying a plan may call. Only `apply` uses these, and only after the person confirms. */
export interface TabActionDeps {
  tidy(): Promise<unknown>;
  closeTab(id: string): Promise<unknown>;
  /** Makes a folder and returns its id. */
  addFolder(name: string): Promise<string | null>;
  moveToFolder(tabId: string, folderId: string): Promise<unknown>;
}

/** Applies a confirmed plan. The sidebar calls this from its Apply button only. */
export async function applyProposal(p: TabProposal, confirmed: boolean, deps: TabActionDeps): Promise<boolean> {
  if (!confirmed) return false;
  if (p.kind === "tidy") {
    await deps.tidy();
    return true;
  }
  for (const id of p.close) await deps.closeTab(id);
  for (const f of p.folders) {
    const folderId = await deps.addFolder(f.name);
    if (!folderId) continue;
    for (const id of f.tabs) await deps.moveToFolder(id, folderId);
  }
  return true;
}

/** The prompt Summarise sends to the Ask panel: titles and hosts only, never page text. */
export function summarisePrompt(s: BrowserState): string {
  const tabs = spaceTabs(s).sort((a, b) => a.order - b.order).slice(0, 40);
  const list = tabs.map((t, i) => `${i + 1}. ${tabLabel(t)} (${hostOf(t.url) || t.url})`).join("\n");
  return `Summarise what I'm doing across these open tabs in a few lines, and suggest which I can close:\n${list}`;
}

// ---------- Sections ----------

export interface TabSection {
  id: string;
  label: string | null;
  tabs: Tab[];
}

/** Local midnight before `now`. */
export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Loose tabs split into quiet sections. "time": Today / Earlier (by last use). "site": one
 * section per site with two or more tabs, the rest under "Other". "none": one unlabelled list.
 * Order inside a section is the manual tab order, so drag-to-reorder still decides it.
 */
export function tabSections(tabs: Tab[], group: SidebarPrefs["group"], now: number): TabSection[] {
  const ordered = [...tabs].sort((a, b) => a.order - b.order);
  if (group === "none" || ordered.length < 2) return [{ id: "all", label: null, tabs: ordered }];
  if (group === "time") {
    const cut = startOfDay(now);
    const today = ordered.filter((t) => t.lastActiveMs >= cut);
    const earlier = ordered.filter((t) => t.lastActiveMs < cut);
    if (!today.length || !earlier.length) return [{ id: "all", label: null, tabs: ordered }];
    return [
      { id: "today", label: "Today", tabs: today },
      { id: "earlier", label: "Earlier", tabs: earlier },
    ];
  }
  const by = new Map<string, Tab[]>();
  for (const t of ordered) {
    const h = hostOf(t.url) || "other";
    by.set(h, [...(by.get(h) ?? []), t]);
  }
  const multi = [...by.entries()].filter(([, ts]) => ts.length > 1);
  const single = [...by.entries()].filter(([, ts]) => ts.length === 1).flatMap(([, ts]) => ts);
  if (!multi.length) return [{ id: "all", label: null, tabs: ordered }];
  return [
    ...multi.map(([h, ts]) => ({ id: `site:${h}`, label: h, tabs: ts })),
    ...(single.length ? [{ id: "other", label: "Other", tabs: single }] : []),
  ];
}

/** Sidebar preferences with defaults filled in and values kept in range. */
export function sidebarPrefs(p: Partial<SidebarPrefs> | undefined, defaults: SidebarPrefs, range: { min: number; max: number }): SidebarPrefs {
  const v = { ...defaults, ...(p ?? {}) };
  return {
    width: Math.round(Math.min(range.max, Math.max(range.min, Number.isFinite(v.width) ? v.width : defaults.width))),
    mode: v.mode === "stack" ? "stack" : "full",
    side: v.side === "right" ? "right" : "left",
    group: v.group === "site" || v.group === "none" ? v.group : "time",
    showChats: v.showChats !== false,
    showMedia: v.showMedia !== false,
    showSpaces: v.showSpaces !== false,
  };
}
