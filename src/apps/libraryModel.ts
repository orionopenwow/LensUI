// The Library: what from the catalogue is on this PC, what has an update, and the one
// confirmation for "Update all". Pure, shared by the UI, the approval card and tests.
import type { ApprovalPreview } from "../approval/model";
import type { QueueState } from "./queue";
import type { CatalogApp, InstalledInfo } from "./types";

export interface LibraryRow {
  app: CatalogApp;
  version: string;
  /** The version an update would install, when there is one. */
  available: string | null;
}

export interface LibraryModel {
  updates: LibraryRow[];
  current: LibraryRow[];
  /** Installed + has update, for the tab badge. */
  updateCount: number;
  total: number;
}

const byName = (a: LibraryRow, b: LibraryRow) => a.app.name.localeCompare(b.app.name);

/** Splits what's installed into "Updates" and "Up to date", each sorted by name. Ids that are no
 *  longer in the catalogue are left out (Lens can't say anything true about them). */
export function libraryModel(apps: CatalogApp[], installed: Record<string, InstalledInfo>): LibraryModel {
  const rows: LibraryRow[] = [];
  for (const app of apps) {
    const i = installed[app.id];
    if (i) rows.push({ app, version: i.version, available: i.available?.trim() ? i.available : null });
  }
  const updates = rows.filter((r) => r.available).sort(byName);
  const current = rows.filter((r) => !r.available).sort(byName);
  return { updates, current, updateCount: updates.length, total: rows.length };
}

/** "7 apps on this PC · 2 updates". */
export function librarySummary(m: LibraryModel): string {
  if (!m.total) return "Nothing from the catalogue is on this PC yet";
  const apps = `${m.total} ${m.total === 1 ? "app" : "apps"} on this PC`;
  if (!m.updateCount) return `${apps} · all up to date`;
  return `${apps} · ${m.updateCount} ${m.updateCount === 1 ? "update" : "updates"}`;
}

/** "1.2.0 → 1.3.0" (or just the version). `installed` strings come from winget and can be odd. */
export function versionLine(row: Pick<LibraryRow, "version" | "available">): string {
  const v = row.version.trim() || "installed";
  return row.available ? `${v} → ${row.available}` : v;
}

/** Updates that can start now: not already queued, running or waiting to run. */
export function updatable(m: LibraryModel, queue: QueueState): LibraryRow[] {
  const busy = new Set(queue.items.filter((i) => i.status === "queued" || i.status === "running" || i.status === "verified").map((i) => i.appId));
  return m.updates.filter((r) => !busy.has(r.app.id));
}

/** Stable id for the open "Update all" confirmation: the same set of apps is the same request. */
export function updateAllReference(rows: LibraryRow[]): string {
  return `apps:update-all:${rows.map((r) => r.app.id).sort().join(",")}`;
}

export function updateAllText(rows: LibraryRow[]): string {
  return rows.length === 1 ? `Update ${rows[0].app.name}` : `Update ${rows.length} apps`;
}

/** The shared approval card for "Update all": every app, its version change and its source. */
export function updateAllPreview(rows: LibraryRow[]): ApprovalPreview {
  const shown = rows.slice(0, 8);
  const details = shown.map((r) => ({ label: r.app.name, value: `${versionLine(r)} · ${sourceOf(r.app)}` }));
  if (rows.length > shown.length) details.push({ label: "And", value: `${rows.length - shown.length} more` });
  return {
    question: `${updateAllText(rows)}?`,
    reason: "Each update comes from the app's own source through winget and is hash-checked before it runs. They run one at a time; you can cancel any that hasn't started.",
    verb: rows.length === 1 ? "Update" : `Update ${rows.length}`,
    denyLabel: "Cancel",
    kind: "none",
    details,
    reversible: false,
    noUndoLine: true,
    risk: "low",
    capabilities: [],
    source: { client: "lens-apps", kind: "internal", label: "Lens Apps" },
    tone: "trusted",
  };
}

export function sourceOf(app: CatalogApp): string {
  if (app.install.method === "winget") return `winget · ${app.install.wingetId}`;
  if (app.install.method === "githubRelease") return `github.com/${app.install.repo}`;
  return app.publisher;
}

/** The digits of a count as separate cells, so a changing number can roll one digit at a time. */
export function digitsOf(n: number): string[] {
  return String(Math.max(0, Math.floor(n))).split("");
}

/** The standalone window's `&view=` parameter: "library" (also "updates") opens on the Library;
 *  anything else is Discover. */
export function viewParam(v: string | null): "library" | undefined {
  return v === "library" || v === "updates" ? "library" : undefined;
}
