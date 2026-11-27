// What the Dock's search panel lists before anything is typed: recent files and running windows
// on the home grid, and everything Lens knows about under the filter pills. Typed queries are
// ranked by the shared search (the Dock is handed those rows already mapped). Pure: `open` and
// `focus` are the Dock's own actions.
import type { InstalledApp, RunningWindow } from "../types/lens";
import type { DockFilterTab, LauncherHomeData } from "./model";

/** A row on the home grid's "Recent files and windows" card. */
export interface DockHomeRow {
  id: string;
  title: string;
  sub: string;
  badge: string;
  iconUrl: string | null | undefined;
  isDir: boolean;
  run: () => void;
}

/** A row in the results list (the shape the shared search adapter produces too). */
export interface DockResultRow {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  kind: "apps" | "files" | "folders" | "recent" | "action";
  iconUrl: string | null | undefined;
  run: () => void;
}

export interface DockSearchSources {
  windows: RunningWindow[];
  home: LauncherHomeData;
  installedApps: InstalledApp[];
  /** Switch to a window (the Dock closes search first). */
  focus: (hwnd: number) => void;
  /** Open an app, file or folder by path. */
  open: (path: string) => void;
}

const appName = (w: RunningWindow) => w.processName.replace(/\.exe$/i, "");

/** Up to 12 rows: the three most recent windows, then recent files. */
export function homeRows(s: DockSearchSources): DockHomeRow[] {
  return [
    ...s.windows.slice(0, 3).map((w) => ({
      id: `rr-w-${w.hwnd}`,
      title: w.title || appName(w),
      sub: `${appName(w)} · Window`,
      badge: w.isFocused ? "Active" : "Open",
      iconUrl: w.iconDataUrl as string | null | undefined,
      isDir: false,
      run: () => s.focus(w.hwnd),
    })),
    ...s.home.recentFiles.slice(0, 12).map((rf) => ({
      id: `rr-f-${rf.path}`,
      title: rf.name,
      sub: `${rf.folderName || "Recent"} · ${rf.sizeLabel || (rf.ext ? rf.ext.toUpperCase() : "File")}`,
      badge: rf.ageLabel,
      iconUrl: null as string | null | undefined,
      isDir: Boolean(rf.isDir),
      run: () => s.open(rf.path),
    })),
  ].slice(0, 12);
}

/** Everything listable without a query: windows, quick folders, recent files, installed apps. */
export function browseRows(s: DockSearchSources): DockResultRow[] {
  return [
    ...s.windows.map((w) => ({
      id: `sw-${w.hwnd}`,
      title: w.title,
      subtitle: `${appName(w)} · Window`,
      badge: w.isFocused ? "Active" : "Open",
      kind: "recent" as const,
      iconUrl: w.iconDataUrl as string | null | undefined,
      run: () => s.focus(w.hwnd),
    })),
    ...s.home.folders.map((f) => ({
      id: `sf-${f.path}`,
      title: f.name,
      subtitle: `${f.itemCount ?? 0} items · ${f.path}`,
      badge: "Folder",
      kind: "folders" as const,
      iconUrl: null as string | null | undefined,
      run: () => s.open(f.path),
    })),
    ...s.home.recentFiles.map((rf) => ({
      id: `srf-${rf.path}`,
      title: rf.name,
      subtitle: `${rf.folderName || "Recent"} · ${rf.sizeLabel || (rf.ext ? rf.ext.toUpperCase() : "File")} · ${rf.path}`,
      badge: rf.ageLabel,
      kind: rf.isDir ? ("folders" as const) : ("files" as const),
      iconUrl: null as string | null | undefined,
      run: () => s.open(rf.path),
    })),
    ...s.installedApps.map((a) => ({
      id: `sa-${a.path}`,
      title: a.name,
      subtitle: `Application · ${a.path}`,
      badge: "App",
      kind: "apps" as const,
      iconUrl: null as string | null | undefined,
      run: () => s.open(a.path),
    })),
  ];
}

/** Whether a row belongs under a filter pill ("Running" also lists recent files, as it always has). */
export function inTab(kind: DockResultRow["kind"], tab: DockFilterTab): boolean {
  if (tab === "apps") return kind === "apps";
  if (tab === "files") return kind === "files";
  if (tab === "folders") return kind === "folders";
  if (tab === "recent") return kind === "recent" || kind === "files";
  return true;
}

/** Most rows the panel draws. */
export const DOCK_RESULT_LIMIT = 28;

/** The rows under a filter pill when nothing is typed. */
export function browseResults(s: DockSearchSources, tab: DockFilterTab): DockResultRow[] {
  return browseRows(s).filter((r) => inTab(r.kind, tab)).slice(0, DOCK_RESULT_LIMIT);
}
