// Pure helpers for the Lens Browser sidebar and address bar (unit-tested in src/__tests__/browser.test.ts).
import type { BrowserState, Folder, Tab } from "./api";

export interface SidebarFolder {
  folder: Folder;
  tabs: Tab[];
  badges: number;
}

export interface SidebarModel {
  pinned: Tab[];
  folders: SidebarFolder[];
  loose: Tab[];
  count: number;
  awaiting: number;
}

/** Tabs of the active space, grouped the way the sidebar draws them. */
export function sidebarModel(s: BrowserState): SidebarModel {
  const tabs = s.tabs.filter((t) => t.spaceId === s.activeSpace && !t.archivedMs).sort((a, b) => a.order - b.order);
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  const folders = s.folders
    .filter((f) => f.spaceId === s.activeSpace)
    .map((folder) => {
      const ft = rest.filter((t) => t.folderId === folder.id);
      return { folder, tabs: ft, badges: ft.filter((t) => !!t.badge).length };
    });
  const known = new Set(folders.map((f) => f.folder.id));
  const loose = rest.filter((t) => !t.folderId || !known.has(t.folderId));
  return { pinned, folders, loose, count: tabs.length, awaiting: tabs.filter((t) => t.badge === "approve").length };
}

/** Where a dragged tab lands: index among the space's tabs, plus target folder. */
export function dropIndex(s: BrowserState, beforeTabId: string | null, folder: string | null): { index: number; folder: string | null } {
  const tabs = s.tabs.filter((t) => t.spaceId === s.activeSpace).sort((a, b) => a.order - b.order);
  if (!beforeTabId) return { index: tabs.length, folder };
  const i = tabs.findIndex((t) => t.id === beforeTabId);
  return { index: i < 0 ? tabs.length : i, folder };
}

export function hostOf(url: string): string {
  const m = /^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

/** A letter avatar instead of a remote favicon (the frame UI never loads page images). */
export function avatar(url: string, title = ""): { letter: string; hue: number } {
  const h = hostOf(url) || title || "?";
  let n = 0;
  for (const c of h) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return { letter: (h.replace(/^[^a-z0-9]+/i, "")[0] || "?").toUpperCase(), hue: n % 360 };
}

export function tabLabel(t: Tab): string {
  return t.title.trim() || hostOf(t.url) || t.url;
}

/** Breadcrumb for the address pill: "opentable.com / saltgrass" style. */
export function breadcrumb(url: string): string[] {
  const host = hostOf(url);
  if (!host) return [url];
  const path = url.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  const parts = path.split("/").filter(Boolean).slice(0, 3).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return [host, ...parts];
}

export type AddressKind = { kind: "url"; value: string } | { kind: "search"; value: string } | { kind: "ask"; value: string };

/** Mirrors `classify_address` in model.rs so the UI can label the Enter action as you type. */
export function classifyAddress(input: string): AddressKind | null {
  const t = input.trim();
  if (!t) return null;
  const l = t.toLowerCase();
  if (l === "ask" || l === "/ask" || l === "?") return null;
  for (const p of ["ask ", "/ask ", "? "]) if (l.startsWith(p)) return t.slice(p.length).trim() ? { kind: "ask", value: t.slice(p.length).trim() } : null;
  if (/^https?:\/\//i.test(t)) return { kind: "url", value: t };
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || /^127\./.test(t)) return { kind: "url", value: `http://${t}` };
  if (!/\s/.test(t) && (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t) || /^(\d+\.)+\d+(:\d+)?([/?#].*)?$/.test(t))) return { kind: "url", value: `https://${t}` };
  return { kind: "search", value: t };
}

export function relTime(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms) / 1000;
  if (d < 60) return `${Math.round(d)}s`;
  if (d < 3600) return `${Math.round(d / 60)}m`;
  const date = new Date(ms);
  if (d < 86400) return date.toTimeString().slice(0, 5);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
